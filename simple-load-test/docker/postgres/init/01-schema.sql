-- =====================================
-- Database: simple_load_test
-- =====================================

-- Enable UUID extension (if needed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================
-- Load Requests Table
-- =====================================

CREATE TABLE load_requests (
    id SERIAL PRIMARY KEY,
    intensity INTEGER NOT NULL CHECK (intensity >= 1 AND intensity <= 100),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_id VARCHAR(255),
    client_ip INET,
    duration_ms INTEGER,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

CREATE INDEX idx_load_requests_timestamp ON load_requests(timestamp DESC);
CREATE INDEX idx_load_requests_session ON load_requests(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_load_requests_client_ip ON load_requests(client_ip);

-- =====================================
-- Pod Metrics Table
-- =====================================

CREATE TABLE pod_metrics (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    pod_count INTEGER NOT NULL CHECK (pod_count >= 0),
    running_pods INTEGER DEFAULT 0 CHECK (running_pods >= 0),
    pending_pods INTEGER DEFAULT 0 CHECK (pending_pods >= 0),
    failed_pods INTEGER DEFAULT 0 CHECK (failed_pods >= 0),
    cpu_usage DECIMAL(5,2) CHECK (cpu_usage >= 0),
    memory_usage DECIMAL(10,2) CHECK (memory_usage >= 0),
    namespace VARCHAR(255) NOT NULL DEFAULT 'default',
    deployment_name VARCHAR(255) NOT NULL,
    is_scaling BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_pod_metrics_timestamp ON pod_metrics(timestamp DESC);
CREATE INDEX idx_pod_metrics_deployment ON pod_metrics(deployment_name, timestamp DESC);
CREATE INDEX idx_pod_metrics_namespace ON pod_metrics(namespace);

-- =====================================
-- Sessions Table (Optional)
-- =====================================

CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    client_ip INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    total_requests INTEGER DEFAULT 0
);

CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_last_active ON sessions(last_active DESC);
CREATE INDEX idx_sessions_active ON sessions(is_active) WHERE is_active = TRUE;

-- =====================================
-- Functions
-- =====================================

-- Function to update last_active timestamp
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_active = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session activity
CREATE TRIGGER update_sessions_last_active 
    BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_session_activity();

-- Function to clean up old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete load requests older than 24 hours
    DELETE FROM load_requests 
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '24 hours';
    
    -- Delete pod metrics older than 1 hour
    DELETE FROM pod_metrics 
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '1 hour';
    
    -- Delete inactive sessions older than 1 hour
    DELETE FROM sessions 
    WHERE last_active < CURRENT_TIMESTAMP - INTERVAL '1 hour'
    AND is_active = FALSE;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- Views (for easier querying)
-- =====================================

-- Recent load requests view
CREATE OR REPLACE VIEW recent_load_requests AS
SELECT 
    id,
    intensity,
    timestamp,
    session_id,
    client_ip,
    duration_ms,
    success
FROM load_requests
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour'
ORDER BY timestamp DESC;

-- Latest pod metrics view
CREATE OR REPLACE VIEW latest_pod_metrics AS
SELECT DISTINCT ON (deployment_name, namespace)
    id,
    timestamp,
    pod_count,
    running_pods,
    pending_pods,
    failed_pods,
    cpu_usage,
    memory_usage,
    namespace,
    deployment_name,
    is_scaling
FROM pod_metrics
ORDER BY deployment_name, namespace, timestamp DESC;

-- Active sessions view
CREATE OR REPLACE VIEW active_sessions AS
SELECT 
    id,
    session_id,
    created_at,
    last_active,
    client_ip,
    total_requests,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_active)) as seconds_inactive
FROM sessions
WHERE is_active = TRUE
AND last_active > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
ORDER BY last_active DESC;

-- =====================================
-- Sample Data (for testing)
-- =====================================

-- Insert sample load requests
INSERT INTO load_requests (intensity, session_id, client_ip, duration_ms) VALUES
(25, 'sess_001', '127.0.0.1', 1000),
(50, 'sess_001', '127.0.0.1', 1200),
(75, 'sess_002', '127.0.0.1', 800);

-- Insert sample pod metrics
INSERT INTO pod_metrics (pod_count, running_pods, cpu_usage, memory_usage, deployment_name) VALUES
(1, 1, 25.5, 128.0, 'load-target'),
(2, 2, 45.2, 256.0, 'load-target'),
(3, 3, 65.8, 384.0, 'load-target');

-- Insert sample session
INSERT INTO sessions (session_id, client_ip, user_agent, total_requests) VALUES
('sess_001', '127.0.0.1', 'Mozilla/5.0 (Test)', 2),
('sess_002', '127.0.0.1', 'Mozilla/5.0 (Test)', 1);

-- =====================================
-- Permissions (if needed)
-- =====================================

-- Create application user
-- CREATE USER app_user WITH PASSWORD 'secure_password';

-- Grant permissions
-- GRANT SELECT, INSERT, UPDATE ON load_requests TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON pod_metrics TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON sessions TO app_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;