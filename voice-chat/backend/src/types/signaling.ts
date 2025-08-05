export interface WebRTCOffer {
  type: 'offer';
  sdp: string;
}

export interface WebRTCAnswer {
  type: 'answer';
  sdp: string;
}

export interface ICECandidate {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
}

export interface SignalingMessage {
  from: string;
  to: string;
  roomId: string;
  data: WebRTCOffer | WebRTCAnswer | ICECandidate;
}

export interface JoinRoomRequest {
  roomId: string;
  participantId: string;
}

export interface LeaveRoomRequest {
  roomId: string;
  participantId: string;
}

export interface OfferMessage {
  roomId: string;
  from: string;
  to: string;
  offer: WebRTCOffer;
}

export interface AnswerMessage {
  roomId: string;
  from: string;
  to: string;
  answer: WebRTCAnswer;
}

export interface ICECandidateMessage {
  roomId: string;
  from: string;
  to: string;
  candidate: ICECandidate;
}

export class InvalidDestinationError extends Error {
  constructor(destination: string, roomId: string) {
    super(`Invalid destination '${destination}' in room '${roomId}'`);
    this.name = 'InvalidDestinationError';
  }
}

export class SignalingValidationError extends Error {
  constructor(message: string) {
    super(`Signaling validation error: ${message}`);
    this.name = 'SignalingValidationError';
  }
}
