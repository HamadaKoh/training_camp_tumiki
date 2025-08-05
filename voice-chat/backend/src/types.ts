/**
 * 【型定義】: TASK-102 ルーム管理機能のためのTypeScript型定義
 * 【実装方針】: テスト先行開発で定義されたインターフェースの実装
 * 【設計方針】: 強い型付けによる安全性の確保とテスト要件の満足
 */

/**
 * 【Participant】: ルーム参加者の情報を管理する基本インターフェース
 * 【UUID v4】: 参加者IDは一意性を保証するUUID v4形式
 * 【状態管理】: ミュート、画面共有、接続品質の管理
 */
export interface Participant {
  id: string; // UUID v4形式の参加者ID
  socketId: string; // Socket.IOクライアントID
  joinedAt: Date; // 参加日時
  isMuted: boolean; // ミュート状態
  isSharingScreen: boolean; // 画面共有状態
  connectionQuality: string; // 接続品質 ('good' | 'fair' | 'poor')
}

/**
 * 【RoomJoinedData】: join-roomイベントのレスポンスデータ構造
 * 【Socket.IOイベント】: room-joinedイベントで送信される情報
 */
export interface RoomJoinedData {
  success: boolean;
  participant: Participant;
  participants: Participant[];
}

/**
 * 【ErrorData】: エラー情報の標準構造
 * 【エラーハンドリング】: 統一されたエラー情報の提供
 */
export interface ErrorData {
  code: string;
  message: string;
}

/**
 * 【ConnectionInfo】: 接続情報の詳細
 * 【セッション管理】: データベース保存用の接続詳細
 */
export interface ConnectionInfo {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * 【SignalingData】: WebRTCシグナリングデータ構造
 * 【用途】: offer/answerイベントのデータ形式
 */
export interface SignalData {
  from: string; // 送信者の参加者ID
  to: string; // 宛先参加者ID
  signal: {
    // WebRTC Offer/Answer情報
    type: 'offer' | 'answer';
    sdp?: string;
  };
}

/**
 * 【IceCandidateData】: ICE候補データ構造
 * 【用途】: ice-candidateイベントのデータ形式
 */
export interface IceCandidateData {
  from: string; // 送信者の参加者ID
  to: string; // 宛先参加者ID
  candidate: {
    // ICE候補情報
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  };
}

/**
 * 【SignalingErrorData】: シグナリングエラーレスポンス
 * 【用途】: signaling-errorイベントのデータ形式
 */
export interface SignalingErrorData {
  code: string; // エラーコード
  message: string; // エラーメッセージ
  details?: any; // 詳細情報（オプション）
}
