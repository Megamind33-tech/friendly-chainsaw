use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// A consumer that has gone this long without a hit is not "live" anymore,
/// regardless of what its rate looked like before — a killed OBS source
/// must read as no_consumer within a few seconds, not linger as "live".
const STALE_THRESHOLD: Duration = Duration::from_millis(3000);
/// How far back we look when computing a rate. Long enough to smooth over
/// jitter, short enough that a rate change is visible within a few seconds.
const RATE_WINDOW: Duration = Duration::from_secs(5);
/// Below this fraction of expected fps, a present-but-slow consumer reads
/// as "stalled" rather than "live". A starting guess, not load-bearing.
const STALLED_RATE_RATIO: f64 = 0.5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProgramState {
    Live,
    Stalled,
    NoConsumer,
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusSnapshot {
    pub program_state: ProgramState,
    pub requests_per_second: f64,
    pub expected_fps: f64,
    pub health_pct: f64,
    /// Honest proxy metric: expected pulls in the window minus pulls
    /// actually observed. NOT a count of dropped video frames — there is
    /// no video pipeline yet (Phase 8). Callers must label this as a
    /// proxy wherever it's displayed.
    pub missed_pulls_proxy: f64,
}

/// Tracks real request timestamps for a rolling window. This is the only
/// source of truth for "is something actually pulling /program" — nothing
/// here is fabricated or timer-simulated.
pub struct RequestStats {
    hits: VecDeque<Instant>,
}

impl RequestStats {
    pub fn new() -> Self {
        Self { hits: VecDeque::new() }
    }

    pub fn record_hit(&mut self) {
        self.record_hit_at(Instant::now());
    }

    pub fn record_hit_at(&mut self, now: Instant) {
        self.hits.push_back(now);
        self.prune(now);
    }

    pub fn snapshot(&mut self, expected_fps: f64) -> StatusSnapshot {
        self.snapshot_at(Instant::now(), expected_fps)
    }

    pub fn snapshot_at(&mut self, now: Instant, expected_fps: f64) -> StatusSnapshot {
        self.prune(now);

        let last_hit_age = self.hits.back().map(|&t| now.saturating_duration_since(t));
        let window_secs = self
            .hits
            .front()
            .map(|&t| now.saturating_duration_since(t).as_secs_f64())
            .unwrap_or(0.0);

        let requests_per_second = if self.hits.len() >= 2 && window_secs > 0.0 {
            (self.hits.len() as f64 - 1.0) / window_secs
        } else {
            0.0
        };

        let program_state = match last_hit_age {
            None => ProgramState::NoConsumer,
            Some(age) if age > STALE_THRESHOLD => ProgramState::NoConsumer,
            Some(_) if expected_fps > 0.0 && requests_per_second < expected_fps * STALLED_RATE_RATIO => {
                ProgramState::Stalled
            }
            Some(_) => ProgramState::Live,
        };

        let health_pct = if expected_fps > 0.0 {
            (requests_per_second / expected_fps * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };

        let expected_count = expected_fps * window_secs;
        let missed_pulls_proxy = (expected_count - self.hits.len() as f64).max(0.0);

        StatusSnapshot {
            program_state,
            requests_per_second,
            expected_fps,
            health_pct,
            missed_pulls_proxy,
        }
    }

    fn prune(&mut self, now: Instant) {
        while let Some(&front) = self.hits.front() {
            if now.saturating_duration_since(front) > RATE_WINDOW {
                self.hits.pop_front();
            } else {
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_hits_is_no_consumer() {
        let mut stats = RequestStats::new();
        let snap = stats.snapshot(30.0);
        assert_eq!(snap.program_state, ProgramState::NoConsumer);
        assert_eq!(snap.requests_per_second, 0.0);
        assert_eq!(snap.missed_pulls_proxy, 0.0);
    }

    #[test]
    fn steady_heartbeat_at_expected_fps_is_live() {
        let mut stats = RequestStats::new();
        let base = Instant::now();
        // 30 hits, 33ms apart == a 30fps heartbeat over ~1 second.
        for i in 0..30 {
            stats.record_hit_at(base + Duration::from_millis(33 * i));
        }
        let now = base + Duration::from_millis(33 * 29);
        let snap = stats.snapshot_at(now, 30.0);
        assert_eq!(snap.program_state, ProgramState::Live);
        assert!(snap.requests_per_second > 25.0, "rate was {}", snap.requests_per_second);
        assert!(snap.health_pct > 80.0, "health was {}", snap.health_pct);
    }

    #[test]
    fn halving_cadence_halves_measured_rate() {
        let base = Instant::now();

        let mut fast = RequestStats::new();
        for i in 0..30 {
            fast.record_hit_at(base + Duration::from_millis(33 * i));
        }
        let fast_snap = fast.snapshot_at(base + Duration::from_millis(33 * 29), 30.0);

        let mut slow = RequestStats::new();
        for i in 0..30 {
            slow.record_hit_at(base + Duration::from_millis(66 * i));
        }
        let slow_snap = slow.snapshot_at(base + Duration::from_millis(66 * 29), 30.0);

        assert!(
            (fast_snap.requests_per_second / slow_snap.requests_per_second - 2.0).abs() < 0.05,
            "fast={} slow={}",
            fast_snap.requests_per_second,
            slow_snap.requests_per_second
        );
    }

    #[test]
    fn slow_cadence_below_half_expected_is_stalled() {
        let mut stats = RequestStats::new();
        let base = Instant::now();
        // 15 hits over ~1s against an expected 30fps == half rate, right at
        // the stalled boundary; push a little slower to land clearly under it.
        for i in 0..15 {
            stats.record_hit_at(base + Duration::from_millis(90 * i));
        }
        let now = base + Duration::from_millis(90 * 14);
        let snap = stats.snapshot_at(now, 30.0);
        assert_eq!(snap.program_state, ProgramState::Stalled);
    }

    #[test]
    fn stale_hits_read_as_no_consumer_even_with_prior_activity() {
        let mut stats = RequestStats::new();
        let base = Instant::now();
        for i in 0..30 {
            stats.record_hit_at(base + Duration::from_millis(33 * i));
        }
        // 4 seconds after the last real hit, well past STALE_THRESHOLD.
        let now = base + Duration::from_millis(33 * 29) + Duration::from_secs(4);
        let snap = stats.snapshot_at(now, 30.0);
        assert_eq!(snap.program_state, ProgramState::NoConsumer);
    }
}
