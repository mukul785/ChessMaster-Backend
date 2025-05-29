const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Track active games with enhanced state management
const games = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createGame', () => {
        const gameId = Math.random().toString(36).substr(2, 6);
        games.set(gameId, {
            players: [{ id: socket.id, color: 'w' }],
            currentPosition: null,
            turn: 'w',
            movesList: [],
            status: 'waiting' // waiting, active, finished
        });
        socket.join(gameId);
        socket.emit('gameCreated', {
            gameId,
            color: 'w',
            status: 'waiting'
        });
    });

    socket.on('joinGame', (gameId) => {
        const game = games.get(gameId);
        if (game && game.players.length < 2) {
            game.players.push({ id: socket.id, color: 'b' });
            game.status = 'active';
            socket.join(gameId);

            // Notify both players that game has started
            io.to(gameId).emit('gameStarted', {
                gameId,
                players: game.players,
                turn: game.turn,
                status: game.status
            });

            // Send color assignment to the joining player
            socket.emit('playerColor', 'b');
        } else {
            socket.emit('gameError', {
                message: game ? 'Game is full' : 'Game not found'
            });
        }
    });

    socket.on('moveMade', ({ gameId, newPosition, newMove, piece }) => {
        const game = games.get(gameId);
        if (game && game.status === 'active') {
            if (piece[0] === game.turn) {
                const newTurn = piece[0] === 'w' ? 'b' : 'w';
                game.currentPosition = newPosition;
                if (piece[0] === 'w') {
                    // For white's move, create new move pair
                    game.movesList.push([newMove, '']);
                } else {
                    // For black's move, complete the last move pair
                    const lastIndex = game.movesList.length - 1;
                    if (lastIndex >= 0) {
                        game.movesList[lastIndex][1] = newMove;
                    }
                }
                game.turn = newTurn;

                // Broadcast to ALL players
                io.to(gameId).emit('moveMade', {
                    newPosition,
                    newMove,
                    turn: newTurn,
                    piece,
                    moveNumber: game.movesList.length,
                    gameStatus: game.status,
                    movesList: game.movesList
                });

                console.log(`Move made in game ${gameId}:`, {
                    newMove,
                    turn: newTurn,
                    position: newPosition
                });
            } else {
                socket.emit('gameError', {
                    message: 'Not your turn'
                });
            }
        }
    });

    socket.on('gameOver', ({ gameId, result }) => {
        const game = games.get(gameId);
        if (game) {
            game.status = 'finished';
            game.result = result;
            io.to(gameId).emit('gameEnded', {
                result,
                status: 'finished'
            });
        }
    });

    // socket.on('takeBack', ({ gameId }) => {
    //     const game = games.get(gameId);
    //     if (game && game.status === 'active') {
    //         // Broadcast take-back to all players in the game
    //         io.to(gameId).emit('takeBackMove');
    //     }
    // });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Clean up games and notify remaining players
        games.forEach((game, gameId) => {
            const playerIndex = game.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                io.to(gameId).emit('playerDisconnected', {
                    playerId: socket.id,
                    color: game.players[playerIndex].color
                });
                games.delete(gameId);
            }
        });
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        socket.emit('gameError', {
            message: 'An error occurred'
        });
    });
});

// Error handling for the server
server.on('error', (error) => {
    console.error('Server error:', error);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Chess server running on port ${PORT}`);
});