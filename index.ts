import { Server, Socket } from 'socket.io';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import 'dotenv/config';

import { getSentence } from './utils/getSentence.js';
import { getPointsAndAccuracy } from './utils/getPoints.js';
import { COUNTDOWN_TIME, MATCH_PLAY_TIME } from './constants/constants.js';

import type roomType from './types/room';
import type resultType from './types/result';
import type { Players } from './types/room';

const app = express();
app.use(
    cors({
        origin: process.env.CLIENT_URL,
        methods: ['GET', 'POST'],
        credentials: true,
    })
);
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL,
        methods: ['GET', 'POST'],
    },
});

app.get('/server', (req, res) => {
    res.json({
        message: 'Server is running',
    });
});

httpServer.listen(3001, () => {
    console.log('Server is running on port 3001');
});

let waitingPlayer: Socket | null = null;
let matchRooms: Map<string, roomType> = new Map();
// 매칭 할 경우 소켓 연결

const removeRoom = (room: roomType) => {
    if (room.readyCountdownInterval) {
        clearInterval(room.readyCountdownInterval);
    }
    if (room.gameCountdownInterval) {
        clearInterval(room.gameCountdownInterval);
    }
    if (room.elapsedTime) {
        clearInterval(room.elapsedTime);
    }
    if (room.remainingTime) {
        clearInterval(room.remainingTime);
    }

    room.readyCountdownInterval = null;
    room.gameCountdownInterval = null;
    room.elapsedTime = null;
    room.remainingTime = null;
    matchRooms.delete(room.roomId);
};

const getRoomPlayer = (roomId: string, socketId: string) => {
    if (!roomId || !socketId) return null;

    const room = matchRooms.get(roomId);
    let player: Players | null = null;
    let opponent: Players | null = null;

    if (room?.players.player1.socketId === socketId) {
        player = room?.players.player1;
        opponent = room?.players.player2;
    } else if (room?.players.player2.socketId === socketId) {
        player = room?.players.player2;
        opponent = room?.players.player1;
    }

    return { room, player, opponent };
};

const getPlayers = (room: roomType, socketId: string) => {
    if (!room) return;

    let playerKey: 'player1' | 'player2' | null = null;
    if (room.players.player1.socketId === socketId) {
        playerKey = 'player1';
    } else if (room.players.player2.socketId === socketId) {
        playerKey = 'player2';
    }
    if (!playerKey) return;

    let player = room.players[playerKey];
    let opponent = room.players[playerKey === 'player1' ? 'player2' : 'player1'];
    return { player, opponent };
};

// socket.id = 나의 고유 id
io.on('connection', (socket) => {
    console.log('User Connected', socket.id);

    // 연결 해제
    socket.on('disconnect', () => {
        console.log('User Disconnected', socket.id);

        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            return;
        }

        matchRooms.forEach((room) => {
            const isPlayer1 = room.players.player1.socketId === socket.id;
            const isPlayer2 = room.players.player2.socketId === socket.id;
            if (isPlayer1 || isPlayer2) {
                const opponentId = isPlayer1 ? room.players.player2.socketId : room.players.player1.socketId;

                // 상대방에게 메시지 전달.
                io.to(opponentId).emit('match_cancelled', {
                    reason: 'opponent_disconnected',
                });
                removeRoom(room);
            }
        });
    });

    // 매치 찾기 요청
    socket.on('find_match', () => {
        // 매칭이 성공 된 경우.
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const newRoom: roomType = {
                roomId: `room-${Date.now()}`,
                players: {
                    player1: {
                        socketId: waitingPlayer.id,
                        progress: 0,
                        currentSentenceIndex: 0,
                        point: 0,
                        isCompleted: false,
                    },
                    player2: {
                        socketId: socket.id,
                        progress: 0,
                        currentSentenceIndex: 0,
                        point: 0,
                        isCompleted: false,
                    },
                },
                sentence: getSentence(),
                results: new Map<string, resultType>(),
                readyCountdownInterval: null,
            };

            // 방 추가
            matchRooms.set(newRoom.roomId, newRoom);

            // 방에 참가 시킴
            waitingPlayer.join(newRoom.roomId);
            socket.join(newRoom.roomId);

            // 웨이팅 플레이어를 비움.
            waitingPlayer = null;

            io.to(newRoom.roomId).emit('found_match', {
                roomId: newRoom.roomId,
                message: '매칭 완료',
            });

            let countdown = COUNTDOWN_TIME;
            newRoom.gameCountdownInterval = setInterval(() => {
                countdown--;
                io.to(newRoom.roomId).emit('match_countdown', {
                    countdown,
                });
                if (countdown <= 0) {
                    clearInterval(newRoom.gameCountdownInterval!);
                    newRoom.gameCountdownInterval = null;
                    newRoom.matchStartTime = Date.now();

                    const result = getPlayers(newRoom, socket.id);
                    if (!result) return;
                    const { player, opponent } = result;

                    if (!player || !opponent) return;

                    io.to(newRoom.roomId).emit('match_start', {
                        player: {
                            currentSentenceIndex: 0,
                            sentence: newRoom.sentence[0],
                            progress: 0,
                            point: 0,
                            isCompleted: false,
                        },
                        opponent: {
                            currentSentenceIndex: 0,
                            sentence: newRoom.sentence[0],
                            progress: 0,
                            point: 0,
                        },

                        matchStartTime: newRoom.matchStartTime,
                    });

                    let remainingTime = MATCH_PLAY_TIME;
                    io.to(newRoom.roomId).emit('match_remaining_time', {
                        matchPlayTime: MATCH_PLAY_TIME,
                        remainingTime,
                    });
                    newRoom.remainingTime = setInterval(() => {
                        remainingTime--;
                        io.to(newRoom.roomId).emit('match_remaining_time', {
                            matchPlayTime: MATCH_PLAY_TIME,
                            remainingTime,
                        });

                        if (remainingTime <= 0) {
                            if (newRoom.matchStartTime) {
                                const finishedTime = Date.now() - newRoom.matchStartTime;

                                if (!player.finished) player.finished = finishedTime;
                                if (!opponent.finished) opponent.finished = finishedTime;
                            }

                            io.to(player.socketId).emit('match_result', {
                                player,
                                opponent,
                            });
                            io.to(opponent.socketId).emit('match_result', {
                                player: opponent,
                                opponent: player,
                            });
                            removeRoom(newRoom);
                        }
                    }, 1000);
                }
            }, 1000);
        } else {
            waitingPlayer = socket;

            socket.emit('find_match', {
                message: '매칭 중',
            });
        }
    });

    // 매치 찾기 요청 취소
    socket.on('cancel_find_match', () => {
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            socket.emit('cancel_find_match', {
                message: '매칭 취소',
            });
            waitingPlayer = null;
        }
    });

    socket.on('match_log', (roomId: string, log: { sentence: string; typing: string }[]) => {
        const room = matchRooms.get(roomId);
        if (!room) return;

        const result = getPlayers(room, socket.id);
        if (!result) return;
        const { player, opponent } = result;
        if (!player || !opponent) return;

        // 2. 데이터 직접 수정 (참조 문제 해결)
        player.logs = log;

        if (player.currentSentenceIndex < room.sentence.length) {
            player.currentSentenceIndex++;
        }

        if (player.currentSentenceIndex === room.sentence.length && room.matchStartTime) {
            player.isCompleted = true;
            player.finished = Date.now() - room.matchStartTime;
        }

        // 3. 각 플레이어에게 개별적으로 자신의 관점에서 데이터 전송

        const { points, accuracy } = getPointsAndAccuracy(player.logs || []);
        const { points: opponentPoints, accuracy: opponentAccuracy } = getPointsAndAccuracy(opponent.logs || []);

        player.point = points;
        player.accuracy = accuracy;
        player.progress = (player.currentSentenceIndex / room.sentence.length) * 100 || 0;

        const playerSnap = {
            socketId: player.socketId,
            currentSentenceIndex: player.currentSentenceIndex,
            sentence: room.sentence[player.currentSentenceIndex],
            progress: Math.round(player.progress),
            point: points,
            accuracy: accuracy,
            isCompleted: player.isCompleted,
            finished: player.finished,
        };

        const opponentSnap = {
            socketId: opponent.socketId,
            currentSentenceIndex: opponent.currentSentenceIndex,
            sentence: room.sentence[opponent.currentSentenceIndex],
            progress: Math.round(opponent.progress),
            point: opponentPoints,
            accuracy: opponentAccuracy,
            isCompleted: opponent.isCompleted,
            finished: opponent.finished,
        };

        if (player.isCompleted && opponent.isCompleted) {
            io.to(player.socketId).emit('match_result', {
                player: playerSnap,
                opponent: opponentSnap,
            });
            io.to(opponent.socketId).emit('match_result', {
                player: opponentSnap,
                opponent: playerSnap,
            });
            removeRoom(room);
            return;
        }

        // Player에게: 자신이 player, 상대가 opponent
        io.to(player.socketId).emit('match_log', {
            player: playerSnap,
            opponent: opponentSnap,
        });

        // Opponent에게: 자신이 player, 상대가 opponent (역순)
        io.to(opponent.socketId).emit('match_log', {
            player: opponentSnap,
            opponent: playerSnap,
        });
    });

    socket.on('match_cpm', (roomId: string, cpm: number) => {
        const result = getRoomPlayer(roomId, socket.id);
        if (!result) return;
        const { player, opponent } = result;
        if (!player || !opponent) return;

        io.to(opponent.socketId).emit('opponent_cpm', { cpm });
    });
});
