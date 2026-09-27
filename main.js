const game = new Chess();

let board = null;
let playerColor = "w";
let botColor = "b";
let thinking = false;

const colorSelect = document.getElementById("colorSelect");
const startBtn = document.getElementById("startBtn");
const movesElement = document.getElementById("moves");
const moveCountElement = document.getElementById("moveCount");
const statusElement = document.querySelector(".status");

function getRandomColor() {
    return Math.random() < 0.5 ? "w" : "b";
}

function startGame() {
    game.reset();

    const selected = colorSelect.value;

    if (selected === "random") {
        playerColor = getRandomColor();
    } else {
        playerColor = selected === "white" ? "w" : "b";
    }

    botColor = playerColor === "w" ? "b" : "w";

    const config = {
        draggable: true,
        position: "start",
        orientation: playerColor === "w" ? "white" : "black",

        onDragStart: function (source, piece) {
            if (thinking) return false;

            // Alleen eigen stukken mogen verplaatst worden
            if (game.game_over()) return false;

            if (game.turn() !== playerColor) return false;

            if (
                (game.turn() === "w" && piece.search(/^b/) !== -1) ||
                (game.turn() === "b" && piece.search(/^w/) !== -1)
            ) {
                return false;
            }

            return true;
        },

        onDrop: function (source, target) {
            const move = game.move({
                from: source,
                to: target,
                promotion: "q"
            });

            if (move === null) {
                return "snapback";
            }

            updateUI();

            if (!game.game_over()) {
                setTimeout(botMove, 350);
            }
        },

        onSnapEnd: function () {
            board.position(game.fen());
        }
    };

    if (board) {
        board.destroy();
    }

    board = Chessboard("board", config);

    updateUI();

    if (botColor === "w") {
        setTimeout(botMove, 500);
    }
}

function updateUI() {
    if (!movesElement || !moveCountElement) return;

    const history = game.history();

    movesElement.innerHTML = "";

    for (let i = 0; i < history.length; i += 2) {
        const number = Math.floor(i / 2) + 1;
        const whiteMove = history[i] || "";
        const blackMove = history[i + 1] || "";

        const row = document.createElement("div");
        row.className = "move-row";

        row.innerHTML = `
            <span>${number}.</span>
            <strong>${whiteMove}</strong>
            <strong>${blackMove}</strong>
        `;

        movesElement.appendChild(row);
    }

    moveCountElement.textContent = history.length;

    updateStatus();
}

function updateStatus() {
    if (!statusElement) return;

    if (game.isCheckmate()) {
        const winner = game.turn() === "w" ? "Zwart" : "Wit";
        statusElement.textContent = `${winner} wint`;
        return;
    }

    if (game.isDraw()) {
        statusElement.textContent = "Remise";
        return;
    }

    if (thinking) {
        statusElement.textContent = "Obsidian denkt...";
        return;
    }

    if (game.turn() === playerColor) {
        statusElement.textContent = "Jouw beurt";
    } else {
        statusElement.textContent = "Obsidian is aan zet";
    }
}

function botMove() {
    if (game.game_over()) return;

    thinking = true;
    updateStatus();

    setTimeout(() => {
        const moves = game.moves({ verbose: true });

        if (moves.length === 0) {
            thinking = false;
            updateUI();
            return;
        }

        const bestMove = findBestMove(2);

        game.move({
            from: bestMove.from,
            to: bestMove.to,
            promotion: "q"
        });

        board.position(game.fen());

        thinking = false;
        updateUI();
    }, 300);
}

function findBestMove(depth) {
    const moves = game.moves({ verbose: true });

    let bestMove = moves[0];
    let bestScore = botColor === "w"
        ? -Infinity
        : Infinity;

    for (const move of moves) {
        game.move({
            from: move.from,
            to: move.to,
            promotion: "q"
        });

        const score = minimax(depth - 1, -Infinity, Infinity);

        game.undo();

        if (botColor === "w") {
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        } else {
            if (score < bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
    }

    return bestMove;
}

function minimax(depth, alpha, beta) {
    if (depth === 0 || game.game_over()) {
        return evaluateBoard();
    }

    const moves = game.moves({ verbose: true });

    if (game.turn() === "w") {
        let maxEval = -Infinity;

        for (const move of moves) {
            game.move({
                from: move.from,
                to: move.to,
                promotion: "q"
            });

            const evaluation = minimax(depth - 1, alpha, beta);

            game.undo();

            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);

            if (beta <= alpha) break;
        }

        return maxEval;
    } else {
        let minEval = Infinity;

        for (const move of moves) {
            game.move({
                from: move.from,
                to: move.to,
                promotion: "q"
            });

            const evaluation = minimax(depth - 1, alpha, beta);

            game.undo();

            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);

            if (beta <= alpha) break;
        }

        return minEval;
    }
}

function evaluateBoard() {
    const values = {
        p: 100,
        n: 320,
        b: 330,
        r: 500,
        q: 900,
        k: 20000
    };

    let score = 0;

    const boardState = game.board();

    for (let row of boardState) {
        for (let piece of row) {
            if (!piece) continue;

            const value = values[piece.type];

            if (piece.color === "w") {
                score += value;
            } else {
                score -= value;
            }
        }
    }

    return score;
}

startBtn.addEventListener("click", startGame);

startGame();
