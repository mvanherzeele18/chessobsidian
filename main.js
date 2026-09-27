// ============================================
// OBSIDIAN CHESS - MAIN
// ============================================

let chess;
let playerColor = null;
let obsidianColor = null;

let selectedSquare = null;
let gameStarted = false;
let obsidianThinking = false;


// Unicode schaakstukken
const PIECES = {
    w: {
        k: "♔",
        q: "♕",
        r: "♖",
        b: "♗",
        n: "♘",
        p: "♙"
    },

    b: {
        k: "♚",
        q: "♛",
        r: "♜",
        b: "♝",
        n: "♞",
        p: "♟"
    }
};


// HTML elementen
const setup = document.getElementById("setup");
const gameElement = document.getElementById("game");

const boardElement = document.getElementById("board");

const statusElement = document.getElementById("status");
const gameMessageElement = document.getElementById("gameMessage");

const movesElement = document.getElementById("moves");
const moveCountElement = document.getElementById("moveCount");

const whiteButton = document.getElementById("whiteBtn");
const blackButton = document.getElementById("blackBtn");
const newGameButton = document.getElementById("newGameBtn");


// ============================================
// START
// ============================================

whiteButton.addEventListener("click", () => {
    startGame("w");
});

blackButton.addEventListener("click", () => {
    startGame("b");
});

newGameButton.addEventListener("click", () => {
    resetToSetup();
});


// ============================================
// START GAME
// ============================================

function startGame(color) {

    playerColor = color;
    obsidianColor = color === "w" ? "b" : "w";

    chess = new Chess();

    selectedSquare = null;
    gameStarted = true;
    obsidianThinking = false;

    setup.classList.add("hidden");
    gameElement.classList.remove("hidden");

    drawBoard();
    updateMoves();
    updateStatus();

    // Als de speler zwart heeft gekozen,
    // mag Obsidian beginnen.
    if (obsidianColor === "w") {
        setTimeout(makeObsidianMove, 500);
    }
}


// ============================================
// DRAW BOARD
// ============================================

function drawBoard() {

    boardElement.innerHTML = "";

    const board = chess.board();

    /*
        chess.board() geeft rijen van 8 tot 1 terug.

        Als speler wit is:
        8 → 1
        a → h

        Als speler zwart is:
        1 → 8
        h → a
    */

    let rows = [...Array(8).keys()];

    if (playerColor === "b") {
        rows.reverse();
    }

    let columns = [...Array(8).keys()];

    if (playerColor === "b") {
        columns.reverse();
    }


    for (const rowIndex of rows) {

        for (const columnIndex of columns) {

            const piece = board[rowIndex][columnIndex];

            const file = String.fromCharCode(97 + columnIndex);
            const rank = 8 - rowIndex;

            const squareName = `${file}${rank}`;

            const square = document.createElement("div");

            square.classList.add("square");

            const isLight =
                (rowIndex + columnIndex) % 2 === 0;

            square.classList.add(
                isLight ? "light" : "dark"
            );

            square.dataset.square = squareName;


            if (piece) {

                const pieceElement =
                    document.createElement("span");

                pieceElement.classList.add("piece");

                pieceElement.classList.add(
                    piece.color === "w"
                        ? "white"
                        : "black"
                );

                pieceElement.textContent =
                    PIECES[piece.color][piece.type];

                square.appendChild(pieceElement);
            }


            square.addEventListener(
                "click",
                () => handleSquareClick(squareName)
            );


            boardElement.appendChild(square);
        }
    }

    highlightSelectedSquare();
}


// ============================================
// SQUARE CLICK
// ============================================

function handleSquareClick(square) {

    if (!gameStarted) {
        return;
    }

    if (obsidianThinking) {
        return;
    }

    // Alleen tijdens onze beurt
    if (chess.turn() !== playerColor) {
        return;
    }


    // Geen stuk geselecteerd
    if (!selectedSquare) {

        const piece = chess.get(square);

        if (!piece) {
            return;
        }

        if (piece.color !== playerColor) {
            return;
        }

        selectedSquare = square;

        highlightSelectedSquare();

        return;
    }


    // Opnieuw op hetzelfde stuk klikken
    if (selectedSquare === square) {

        selectedSquare = null;

        highlightSelectedSquare();

        return;
    }


    // Probeer zet te maken
    const move = chess.move({
        from: selectedSquare,
        to: square,

        // Voor nu altijd promoveren naar dame
        promotion: "q"
    });


    if (!move) {

        // Misschien heeft de speler op
        // een ander eigen stuk geklikt.
        const piece = chess.get(square);

        if (piece && piece.color === playerColor) {

            selectedSquare = square;

            highlightSelectedSquare();

            return;
        }

        return;
    }


    selectedSquare = null;

    drawBoard();
    updateMoves();
    updateStatus();


    // Kijk of het spel afgelopen is
    if (isGameOver()) {
        return;
    }


    // Obsidian mag nu spelen
    setTimeout(makeObsidianMove, 350);
}


// ============================================
// HIGHLIGHT
// ============================================

function highlightSelectedSquare() {

    document
        .querySelectorAll(".square")
        .forEach(square => {

            square.classList.remove(
                "selected",
                "legal",
                "capture"
            );
        });


    if (!selectedSquare) {
        return;
    }


    const selectedElement =
        document.querySelector(
            `[data-square="${selectedSquare}"]`
        );

    if (selectedElement) {
        selectedElement.classList.add("selected");
    }


    // Haal alle mogelijke zetten op
    const legalMoves =
        chess.moves({
            square: selectedSquare,
            verbose: true
        });


    legalMoves.forEach(move => {

        const target =
            document.querySelector(
                `[data-square="${move.to}"]`
            );

        if (!target) {
            return;
        }


        if (move.captured) {
            target.classList.add("capture");
        } else {
            target.classList.add("legal");
        }
    });
}


// ============================================
// OBSIDIAN MOVE
// ============================================

function makeObsidianMove() {

    if (!gameStarted) {
        return;
    }

    if (chess.turn() !== obsidianColor) {
        return;
    }

    if (isGameOver()) {
        return;
    }


    obsidianThinking = true;

    updateStatus();


    // Kleine vertraging zodat het niet lijkt
    // alsof de zet onmiddellijk verschijnt.
    setTimeout(() => {

        const move = Obsidian.getRandomMove(chess);


        if (!move) {

            obsidianThinking = false;

            updateStatus();

            return;
        }


        chess.move({
            from: move.from,
            to: move.to,
            promotion: "q"
        });


        obsidianThinking = false;

        selectedSquare = null;

        drawBoard();
        updateMoves();
        updateStatus();


    }, 450);
}


// ============================================
// STATUS
// ============================================

function updateStatus() {

    if (!gameStarted) {
        statusElement.textContent = "Kies je kleur";
        return;
    }


    if (chess.in_checkmate()) {

        const winner =
            chess.turn() === "w"
                ? "Zwart"
                : "Wit";

        statusElement.textContent =
            `${winner} wint`;

        gameMessageElement.textContent =
            `${winner} heeft schaakmat gezet.`;

        return;
    }


    if (
        chess.in_draw() ||
        chess.in_stalemate() ||
        chess.in_threefold_repetition() ||
        chess.insufficient_material()
    ) {

        statusElement.textContent = "Remise";

        gameMessageElement.textContent =
            "Het spel eindigt in remise.";

        return;
    }


    if (obsidianThinking) {

        statusElement.textContent =
            "Obsidian denkt...";

        gameMessageElement.textContent =
            "Obsidian kiest een zet.";

        return;
    }


    if (chess.turn() === playerColor) {

        statusElement.textContent =
            "Jouw beurt";

        gameMessageElement.textContent =
            "Kies een stuk en maak een zet.";

    } else {

        statusElement.textContent =
            "Obsidian is aan zet";

        gameMessageElement.textContent =
            "Obsidian maakt een zet.";
    }
}


// ============================================
// GAME OVER
// ============================================

function isGameOver() {
    return (
        chess.game_over() ||
        chess.in_checkmate() ||
        chess.in_draw() ||
        chess.in_stalemate()
    );
}


// ============================================
// MOVE LIST
// ============================================

function updateMoves() {

    const history = chess.history();

    movesElement.innerHTML = "";

    moveCountElement.textContent =
        history.length;


    if (history.length === 0) {

        movesElement.innerHTML =
            `<p class="empty-moves">
                Nog geen zetten.
            </p>`;

        return;
    }


    for (let i = 0; i < history.length; i += 2) {

        const row =
            document.createElement("div");

        row.classList.add("move-row");


        const number =
            document.createElement("span");

        number.textContent =
            `${Math.floor(i / 2) + 1}.`;


        const whiteMove =
            document.createElement("strong");

        whiteMove.textContent =
            history[i] || "";


        const blackMove =
            document.createElement("strong");

        blackMove.textContent =
            history[i + 1] || "";


        row.appendChild(number);
        row.appendChild(whiteMove);
        row.appendChild(blackMove);

        movesElement.appendChild(row);
    }


    // Scroll naar beneden
    movesElement.scrollTop =
        movesElement.scrollHeight;
}


// ============================================
// RESET
// ============================================

function resetToSetup() {

    gameStarted = false;
    obsidianThinking = false;
    selectedSquare = null;

    chess = null;

    gameElement.classList.add("hidden");
    setup.classList.remove("hidden");

    statusElement.textContent =
        "Kies je kleur";

    boardElement.innerHTML = "";
}
