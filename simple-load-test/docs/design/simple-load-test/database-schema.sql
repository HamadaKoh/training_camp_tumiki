-- ========================================
-- シンプル負荷テストシミュレーション データベーススキーマ
-- PostgreSQL 14+
-- ========================================

-- 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- テーブル定義
-- ========================================

-- セッション管理テーブル
-- アプリケーションの起動から終了までを1セッションとして管理
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_session_times CHECK (end_time IS NULL OR end_time > start_time)
);

-- 負荷リクエスト記録テーブル
-- ユーザーが生成した負荷リクエストの履歴を保存
CREATE TABLE load_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL,
    intensity INTEGER NOT NULL,
    duration INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_load_request_session 
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    CONSTRAINT chk_intensity_range CHECK (intensity >= 1 AND intensity <= 100),
    CONSTRAINT chk_duration_range CHECK (duration >= 1 AND duration <= 300)
);

-- Podメトリクス記録テーブル
-- 定期的に収集したPodのメトリクスを保存
CREATE TABLE pod_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pod_count INTEGER NOT NULL,
    total_cpu_usage INTEGER NOT NULL, -- millicores
    total_memory_usage BIGINT NOT NULL, -- bytes
    average_cpu_usage INTEGER NOT NULL, -- millicores
    average_memory_usage BIGINT NOT NULL, -- bytes
    
    CONSTRAINT fk_pod_metric_session 
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    CONSTRAINT chk_pod_count CHECK (pod_count >= 0),
    CONSTRAINT chk_cpu_usage CHECK (total_cpu_usage >= 0 AND average_cpu_usage >= 0),
    CONSTRAINT chk_memory_usage CHECK (total_memory_usage >= 0 AND average_memory_usage >= 0)
);

-- ========================================
-- インデックス定義
-- ========================================

-- セッション検索の高速化
CREATE INDEX idx_sessions_start_time ON sessions(start_time DESC);
CREATE INDEX idx_sessions_active ON sessions(end_time) WHERE end_time IS NULL;

-- 負荷リクエスト検索の高速化
CREATE INDEX idx_load_requests_session_id ON load_requests(session_id);
CREATE INDEX idx_load_requests_created_at ON load_requests(created_at DESC);

-- メトリクス検索の高速化
CREATE INDEX idx_pod_metrics_session_id ON pod_metrics(session_id);
CREATE INDEX idx_pod_metrics_timestamp ON pod_metrics(timestamp DESC);
CREATE INDEX idx_pod_metrics_session_timestamp ON pod_metrics(session_id, timestamp DESC);

-- ========================================
-- ビュー定義
-- ========================================

-- アクティブセッションビュー
CREATE VIEW active_sessions AS
SELECT 
    id,
    start_time,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time))::INTEGER as duration_seconds
FROM sessions
WHERE end_time IS NULL;

-- セッション統計ビュー
CREATE VIEW session_statistics AS
SELECT 
    s.id as session_id,
    s.start_time,
    s.end_time,
    COUNT(DISTINCT lr.id) as total_load_requests,
    COUNT(DISTINCT pm.id) as total_metric_records,
    MAX(pm.pod_count) as max_pod_count,
    AVG(pm.pod_count)::NUMERIC(10,2) as avg_pod_count,
    MAX(pm.average_cpu_usage) as max_cpu_usage,
    AVG(pm.average_cpu_usage)::NUMERIC(10,2) as avg_cpu_usage
FROM sessions s
LEFT JOIN load_requests lr ON s.id = lr.session_id
LEFT JOIN pod_metrics pm ON s.id = pm.session_id
GROUP BY s.id, s.start_time, s.end_time;

-- 最新メトリクスビュー
CREATE VIEW latest_metrics AS
SELECT DISTINCT ON (session_id)
    session_id,
    timestamp,
    pod_count,
    total_cpu_usage,
    total_memory_usage,
    average_cpu_usage,
    average_memory_usage
FROM pod_metrics
ORDER BY session_id, timestamp DESC;

-- ========================================
-- 関数定義
-- ========================================

-- セッション終了処理関数
CREATE OR REPLACE FUNCTION end_session(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE sessions 
    SET end_time = CURRENT_TIMESTAMP 
    WHERE id = p_session_id AND end_time IS NULL;
END;
$$ LANGUAGE plpgsql;

-- 古いデータのクリーンアップ関数
CREATE OR REPLACE FUNCTION cleanup_old_data(days_to_keep INTEGER DEFAULT 7)
RETURNS TABLE(deleted_sessions INTEGER, deleted_requests INTEGER, deleted_metrics INTEGER) AS $$
DECLARE
    v_deleted_sessions INTEGER;
    v_deleted_requests INTEGER;
    v_deleted_metrics INTEGER;
BEGIN
    -- 古いメトリクスを削除（カスケード削除のため先に集計）
    SELECT COUNT(*) INTO v_deleted_metrics
    FROM pod_metrics pm
    JOIN sessions s ON pm.session_id = s.id
    WHERE s.end_time < CURRENT_TIMESTAMP - INTERVAL '1 day' * days_to_keep;
    
    -- 古いリクエストを削除（カスケード削除のため先に集計）
    SELECT COUNT(*) INTO v_deleted_requests
    FROM load_requests lr
    JOIN sessions s ON lr.session_id = s.id
    WHERE s.end_time < CURRENT_TIMESTAMP - INTERVAL '1 day' * days_to_keep;
    
    -- 古いセッションを削除（関連データはカスケード削除）
    WITH deleted AS (
        DELETE FROM sessions
        WHERE end_time < CURRENT_TIMESTAMP - INTERVAL '1 day' * days_to_keep
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_deleted_sessions FROM deleted;
    
    RETURN QUERY SELECT v_deleted_sessions, v_deleted_requests, v_deleted_metrics;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- トリガー定義
-- ========================================

-- セッション自動終了トリガー（24時間経過したアクティブセッション）
CREATE OR REPLACE FUNCTION auto_end_old_sessions()
RETURNS VOID AS $$
BEGIN
    UPDATE sessions
    SET end_time = CURRENT_TIMESTAMP
    WHERE end_time IS NULL 
    AND start_time < CURRENT_TIMESTAMP - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 初期データ
-- ========================================

-- デモ用の初期セッションを作成（オプション）
-- INSERT INTO sessions (id, start_time) VALUES 
-- (uuid_generate_v4(), CURRENT_TIMESTAMP);

-- ========================================
-- 権限設定
-- ========================================

-- アプリケーションユーザーの権限設定例
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;