-- =====================================
-- Database: load_test_simulation
-- =====================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search optimization

-- =====================================
-- Users Table
-- =====================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(100),
    ip_address INET NOT NULL,
    user_agent TEXT,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_games_played INTEGER DEFAULT 0,
    total_score BIGINT DEFAULT 0,
    achievements_unlocked INTEGER DEFAULT 0,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_session_id ON users(session_id);
CREATE INDEX idx_users_nickname ON users(nickname) WHERE nickname IS NOT NULL;
CREATE INDEX idx_users_last_active ON users(last_active_at DESC);
CREATE INDEX idx_users_total_score ON users(total_score DESC);

-- =====================================
-- Game Sessions Table
-- =====================================

CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state VARCHAR(50) NOT NULL DEFAULT 'idle',
    difficulty VARCHAR(20) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER GENERATED ALWAYS AS (
        CASE 
            WHEN ended_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
            ELSE NULL
        END
    ) STORED,
    score INTEGER DEFAULT 0,
    max_pods_reached INTEGER DEFAULT 1,
    total_clicks INTEGER DEFAULT 0,
    successful_clicks INTEGER DEFAULT 0,
    bomb_defused BOOLEAN DEFAULT FALSE,
    peak_load_generated NUMERIC(10, 2) DEFAULT 0,
    end_reason VARCHAR(50),
    game_config JSONB NOT NULL DEFAULT '{}',
    statistics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_game_sessions_user_id ON game_sessions(user_id);
CREATE INDEX idx_game_sessions_state ON game_sessions(state);
CREATE INDEX idx_game_sessions_difficulty ON game_sessions(difficulty);
CREATE INDEX idx_game_sessions_score ON game_sessions(score DESC);
CREATE INDEX idx_game_sessions_started_at ON game_sessions(started_at DESC);
CREATE INDEX idx_game_sessions_ended_at ON game_sessions(ended_at DESC) WHERE ended_at IS NOT NULL;

-- =====================================
-- Pod Metrics Table (Time Series)
-- =====================================

CREATE TABLE pod_metrics (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    namespace VARCHAR(255) NOT NULL DEFAULT 'default',
    deployment_name VARCHAR(255) NOT NULL,
    total_pods INTEGER NOT NULL,
    running_pods INTEGER NOT NULL,
    pending_pods INTEGER DEFAULT 0,
    failed_pods INTEGER DEFAULT 0,
    scaling_pods INTEGER DEFAULT 0,
    cpu_utilization NUMERIC(5, 2),
    memory_utilization NUMERIC(5, 2),
    requests_per_second NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Partitioning for time series data (monthly partitions)
CREATE INDEX idx_pod_metrics_timestamp ON pod_metrics(timestamp DESC);
CREATE INDEX idx_pod_metrics_deployment ON pod_metrics(deployment_name, timestamp DESC);
CREATE INDEX idx_pod_metrics_namespace ON pod_metrics(namespace, timestamp DESC);

-- Create partitions for the next 12 months
DO $$
DECLARE
    start_date DATE := DATE_TRUNC('month', CURRENT_DATE);
    end_date DATE;
    partition_name TEXT;
BEGIN
    FOR i IN 0..11 LOOP
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'pod_metrics_' || TO_CHAR(start_date, 'YYYY_MM');
        
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF pod_metrics
            FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        
        start_date := end_date;
    END LOOP;
END $$;

-- =====================================
-- Load Metrics Table
-- =====================================

CREATE TABLE load_metrics (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    game_session_id UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
    active_users INTEGER NOT NULL DEFAULT 0,
    total_requests BIGINT NOT NULL DEFAULT 0,
    requests_per_second NUMERIC(10, 2) NOT NULL DEFAULT 0,
    average_response_time NUMERIC(10, 2),
    p95_response_time NUMERIC(10, 2),
    p99_response_time NUMERIC(10, 2),
    error_rate NUMERIC(5, 2) DEFAULT 0,
    queue_length INTEGER DEFAULT 0,
    cpu_load NUMERIC(5, 2),
    memory_usage NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_load_metrics_timestamp ON load_metrics(timestamp DESC);
CREATE INDEX idx_load_metrics_game_session ON load_metrics(game_session_id) WHERE game_session_id IS NOT NULL;
CREATE INDEX idx_load_metrics_rps ON load_metrics(requests_per_second DESC);

-- =====================================
-- Leaderboard Table (Materialized View)
-- =====================================

CREATE MATERIALIZED VIEW leaderboard AS
WITH ranked_scores AS (
    SELECT 
        u.id AS user_id,
        u.nickname,
        gs.difficulty,
        gs.score,
        gs.max_pods_reached,
        gs.total_clicks,
        gs.duration_seconds,
        gs.bomb_defused,
        gs.ended_at,
        ROW_NUMBER() OVER (
            PARTITION BY gs.difficulty 
            ORDER BY gs.score DESC, gs.duration_seconds ASC
        ) AS rank
    FROM game_sessions gs
    JOIN users u ON gs.user_id = u.id
    WHERE gs.state = 'completed' 
      AND gs.ended_at IS NOT NULL
      AND gs.score > 0
)
SELECT * FROM ranked_scores
WHERE rank <= 100;

CREATE UNIQUE INDEX idx_leaderboard_unique ON leaderboard(difficulty, rank);
CREATE INDEX idx_leaderboard_user_id ON leaderboard(user_id);
CREATE INDEX idx_leaderboard_difficulty ON leaderboard(difficulty);
CREATE INDEX idx_leaderboard_score ON leaderboard(score DESC);

-- =====================================
-- Achievements Table
-- =====================================

CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    icon_url VARCHAR(500),
    points INTEGER DEFAULT 10,
    max_progress INTEGER DEFAULT 1,
    is_hidden BOOLEAN DEFAULT FALSE,
    criteria JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_achievements_code ON achievements(code);
CREATE INDEX idx_achievements_category ON achievements(category);

-- =====================================
-- User Achievements Table
-- =====================================

CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    progress INTEGER DEFAULT 0,
    unlocked_at TIMESTAMP WITH TIME ZONE,
    game_session_id UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX idx_user_achievements_unlocked ON user_achievements(unlocked_at DESC) WHERE unlocked_at IS NOT NULL;

-- =====================================
-- Events Log Table (Audit Trail)
-- =====================================

CREATE TABLE events_log (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}',
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    game_session_id UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_log_type ON events_log(event_type);
CREATE INDEX idx_events_log_user_id ON events_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_events_log_game_session ON events_log(game_session_id) WHERE game_session_id IS NOT NULL;
CREATE INDEX idx_events_log_created_at ON events_log(created_at DESC);

-- =====================================
-- Rate Limiting Table
-- =====================================

CREATE TABLE rate_limits (
    id BIGSERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- IP address or user ID
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    window_end TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '1 minute',
    blocked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_rate_limits_identifier_endpoint ON rate_limits(identifier, endpoint);
CREATE INDEX idx_rate_limits_window_end ON rate_limits(window_end);
CREATE INDEX idx_rate_limits_blocked_until ON rate_limits(blocked_until) WHERE blocked_until IS NOT NULL;

-- =====================================
-- System Configuration Table
-- =====================================

CREATE TABLE system_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_system_config_key ON system_config(key) WHERE is_active = TRUE;

-- =====================================
-- Functions and Triggers
-- =====================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_sessions_updated_at BEFORE UPDATE ON game_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_achievements_updated_at BEFORE UPDATE ON achievements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_achievements_updated_at BEFORE UPDATE ON user_achievements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limits_updated_at BEFORE UPDATE ON rate_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old metrics data
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
    -- Delete pod metrics older than 30 days
    DELETE FROM pod_metrics WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    -- Delete load metrics older than 30 days
    DELETE FROM load_metrics WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    -- Delete events log older than 90 days
    DELETE FROM events_log WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
    
    -- Clean up expired rate limits
    DELETE FROM rate_limits WHERE window_end < CURRENT_TIMESTAMP - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Function to refresh leaderboard materialized view
CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- Initial Data
-- =====================================

-- Insert default achievements
INSERT INTO achievements (code, name, description, category, points) VALUES
('first_click', 'First Click', 'Generate your first load', 'exploration', 5),
('speed_demon', 'Speed Demon', 'Click 100 times in 10 seconds', 'speed', 20),
('pod_master', 'Pod Master', 'Scale to 20 pods', 'skill', 30),
('bomb_defuser', 'Bomb Defuser', 'Successfully defuse the bomb', 'skill', 25),
('survivor', 'Survivor', 'Survive for 5 minutes', 'endurance', 15),
('perfect_game', 'Perfect Game', 'Complete a game without any failed clicks', 'skill', 50),
('high_scorer', 'High Scorer', 'Score over 10000 points', 'skill', 35),
('marathon_runner', 'Marathon Runner', 'Play 10 games in a row', 'endurance', 40),
('load_generator', 'Load Generator', 'Generate 1000 total requests', 'endurance', 20),
('scaling_expert', 'Scaling Expert', 'Trigger autoscaling 10 times', 'skill', 45);

-- Insert default system configuration
INSERT INTO system_config (key, value, description) VALUES
('game.difficulties', '{"easy": {"bombTimer": 60, "loadThreshold": 10}, "normal": {"bombTimer": 45, "loadThreshold": 20}, "hard": {"bombTimer": 30, "loadThreshold": 30}}', 'Game difficulty settings'),
('scaling.hpa', '{"minReplicas": 1, "maxReplicas": 20, "targetCPU": 70}', 'HPA configuration'),
('scaling.keda', '{"pollingInterval": 5, "cooldownPeriod": 30}', 'KEDA configuration'),
('rate_limiting', '{"defaultLimit": 100, "windowMinutes": 1}', 'Rate limiting configuration'),
('maintenance', '{"enabled": false, "message": ""}', 'Maintenance mode settings');

-- =====================================
-- Scheduled Jobs (using pg_cron or similar)
-- =====================================

-- Schedule cleanup job to run daily at 2 AM
-- SELECT cron.schedule('cleanup-old-metrics', '0 2 * * *', 'SELECT cleanup_old_metrics();');

-- Schedule leaderboard refresh every hour
-- SELECT cron.schedule('refresh-leaderboard', '0 * * * *', 'SELECT refresh_leaderboard();');