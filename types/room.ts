import type resultType from './result';
import type { LogType } from './log';

export type Players = {
    socketId: string;
    progress: number;
    logs?: LogType[];
    cpm?: number;
    accuracy?: number;
    currentSentenceIndex: number;
    point: number;
    isCompleted: boolean;
    finished?: number;
};

type roomType = {
    roomId: string;
    players: {
        player1: Players;
        player2: Players;
    };
    results: Map<string, resultType>;
    matchStartTime?: number;
    readyCountdownInterval: ReturnType<typeof setTimeout> | null;
    gameCountdownInterval?: ReturnType<typeof setTimeout> | null;
    elapsedTime?: ReturnType<typeof setTimeout> | null;
    remainingTime?: ReturnType<typeof setTimeout> | null;
    sentence: string[];
};

export default roomType;
