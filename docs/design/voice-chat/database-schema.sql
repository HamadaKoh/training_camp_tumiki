-- ==========================================
-- ボイスチャットアプリケーション データベーススキーマ
-- PostgreSQL 14+
-- ==========================================

-- 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- セッション管理テーブル
-- ==========================================

-- 参加セッション記録
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_id VARCHAR(255) NOT NULL,
    socket_id VARCHAR(255) NOT NULL,
    room_id VARCHAR(255) NOT NULL DEFAULT 'default-room',
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- セッションのインデックス
CREATE INDEX idx_sessions_participant_id ON sessions(participant_id);
CREATE INDEX idx_sessions_room_id ON sessions(room_id);
CREATE INDEX idx_sessions_joined_at ON sessions(joined_at);
CREATE INDEX idx_sessions_active ON sessions(left_at) WHERE left_at IS NULL;

-- ==========================================
-- イベントログテーブル
-- ==========================================

-- アプリケーションイベントログ
CREATE TABLE event_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- イベントタイプの定義
CREATE TYPE event_type AS ENUM (
    'join_room',
    'leave_room',
    'mute_toggle',
    'screen_share_start',
    'screen_share_stop',
    'connection_error',
    'peer_connection_established',
    'peer_connection_failed'
);

-- イベントログのインデックス
CREATE INDEX idx_event_logs_session_id ON event_logs(session_id);
CREATE INDEX idx_event_logs_event_type ON event_logs(event_type);
CREATE INDEX idx_event_logs_occurred_at ON event_logs(occurred_at);

-- ==========================================
-- 接続品質メトリクステーブル
-- ==========================================

-- 接続品質の記録
CREATE TABLE connection_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id),
    peer_session_id UUID REFERENCES sessions(id),
    latency_ms INTEGER,
    packet_loss_percent DECIMAL(5,2),
    jitter_ms INTEGER,
    audio_bandwidth_kbps INTEGER,
    video_bandwidth_kbps INTEGER,
    connection_quality VARCHAR(20),
    measured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 接続品質のインデックス
CREATE INDEX idx_connection_metrics_session_id ON connection_metrics(session_id);
CREATE INDEX idx_connection_metrics_measured_at ON connection_metrics(measured_at);

-- ==========================================
-- ルーム状態スナップショットテーブル
-- ==========================================

-- 定期的なルーム状態の記録（分析用）
CREATE TABLE room_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(255) NOT NULL DEFAULT 'default-room',
    participant_count INTEGER NOT NULL DEFAULT 0,
    screen_sharing_active BOOLEAN NOT NULL DEFAULT FALSE,
    screen_sharing_participant_id VARCHAR(255),
    snapshot_data JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ルームスナップショットのインデックス
CREATE INDEX idx_room_snapshots_room_id ON room_snapshots(room_id);
CREATE INDEX idx_room_snapshots_created_at ON room_snapshots(created_at);

-- ==========================================
-- エラーログテーブル
-- ==========================================

-- エラーとその詳細を記録
CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id),
    error_code VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSONB,
    stack_trace TEXT,
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- エラーログのインデックス
CREATE INDEX idx_error_logs_session_id ON error_logs(session_id);
CREATE INDEX idx_error_logs_error_code ON error_logs(error_code);
CREATE INDEX idx_error_logs_occurred_at ON error_logs(occurred_at);

-- ==========================================
-- ビュー定義
-- ==========================================

-- アクティブセッションビュー
CREATE VIEW active_sessions AS
SELECT 
    s.id,
    s.participant_id,
    s.socket_id,
    s.room_id,
    s.joined_at,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s.joined_at)) AS duration_seconds
FROM sessions s
WHERE s.left_at IS NULL;

-- ルーム統計ビュー
CREATE VIEW room_statistics AS
SELECT 
    room_id,
    COUNT(*) AS active_participants,
    MIN(joined_at) AS earliest_join,
    MAX(joined_at) AS latest_join
FROM active_sessions
GROUP BY room_id;

-- 日次使用統計ビュー
CREATE VIEW daily_usage_stats AS
SELECT 
    DATE(joined_at) AS date,
    COUNT(DISTINCT participant_id) AS unique_participants,
    COUNT(*) AS total_sessions,
    AVG(EXTRACT(EPOCH FROM (COALESCE(left_at, CURRENT_TIMESTAMP) - joined_at))/60) AS avg_session_duration_minutes
FROM sessions
GROUP BY DATE(joined_at);

-- ==========================================
-- ストアドプロシージャ
-- ==========================================

-- セッション終了処理
CREATE OR REPLACE FUNCTION end_session(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE sessions 
    SET left_at = CURRENT_TIMESTAMP 
    WHERE id = p_session_id AND left_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- 古いデータのクリーンアップ
CREATE OR REPLACE FUNCTION cleanup_old_data(days_to_keep INTEGER DEFAULT 30)
RETURNS TABLE(deleted_sessions INTEGER, deleted_events INTEGER, deleted_metrics INTEGER) AS $$
DECLARE
    cutoff_date TIMESTAMP;
    del_sessions INTEGER;
    del_events INTEGER;
    del_metrics INTEGER;
BEGIN
    cutoff_date := CURRENT_TIMESTAMP - INTERVAL '1 day' * days_to_keep;
    
    -- 古いセッションを削除
    DELETE FROM sessions WHERE created_at < cutoff_date;
    GET DIAGNOSTICS del_sessions = ROW_COUNT;
    
    -- 古いイベントログを削除
    DELETE FROM event_logs WHERE occurred_at < cutoff_date;
    GET DIAGNOSTICS del_events = ROW_COUNT;
    
    -- 古いメトリクスを削除
    DELETE FROM connection_metrics WHERE measured_at < cutoff_date;
    GET DIAGNOSTICS del_metrics = ROW_COUNT;
    
    RETURN QUERY SELECT del_sessions, del_events, del_metrics;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- トリガー定義
-- ==========================================

-- セッション終了時のイベントログ自動作成
CREATE OR REPLACE FUNCTION log_session_end()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.left_at IS NULL AND NEW.left_at IS NOT NULL THEN
        INSERT INTO event_logs (session_id, event_type, event_data)
        VALUES (NEW.id, 'leave_room', jsonb_build_object(
            'duration_seconds', EXTRACT(EPOCH FROM (NEW.left_at - NEW.joined_at))
        ));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_session_end
AFTER UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION log_session_end();

-- ==========================================
-- 初期データ
-- ==========================================

-- デフォルトルームの作成（必要に応じて）
INSERT INTO room_snapshots (room_id, participant_count, screen_sharing_active)
VALUES ('default-room', 0, FALSE);

-- ==========================================
-- 権限設定（アプリケーション用ユーザー）
-- ==========================================

-- アプリケーション用ロールの作成
-- CREATE ROLE voice_chat_app WITH LOGIN PASSWORD 'your_secure_password';

-- 必要な権限の付与
-- GRANT CONNECT ON DATABASE voice_chat_db TO voice_chat_app;
-- GRANT USAGE ON SCHEMA public TO voice_chat_app;
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO voice_chat_app;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO voice_chat_app;