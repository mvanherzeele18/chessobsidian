const Obsidian = {

    SEARCH_DEPTH: 5,

    // Waarden zijn bewust iets anders dan alleen materiaal.
    // Obsidian moet begrijpen dat een goede positie soms belangrijker
    // is dan een pion winnen.
    VALUES: {
        p: 100,
        n: 320,
        b: 330,
        r: 500,
        q: 900,
        k: 20000
    },

    MAX_SEARCH_TIME: 10000,

    transpositionTable: new Map(),
    killerMoves: new Map(),
    historyMoves: new Map(),

    searchStart: 0,
    searchAborted: false,

    // ------------------------------------------------------------
    // PUBLIC API
    // ------------------------------------------------------------

    getBestMove(chess) {
        const moves = this.getTopMoves(chess, 1);
        return moves.length ? moves[0].move : null;
    },

    getTopMoves(chess, amount = 3) {

        this.searchStart = performance.now();
        this.searchAborted = false;

        // Niet eindeloos oude posities bewaren.
        if (this.transpositionTable.size > 50000) {
            this.transpositionTable.clear();
        }

        const botColor = chess.turn();
        const moves = chess.moves({ verbose: true });

        if (!moves.length) {
            return [];
        }

        this.orderMoves(chess, moves, botColor);

        const results = [];

        for (const move of moves) {

            if (this.timeExceeded()) {
                this.searchAborted = true;
                break;
            }

            const moveKey = this.moveKey(move);

            chess.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || "q"
            });

            let score;

            if (
                chess.in_checkmate() ||
                chess.in_draw() ||
                chess.in_stalemate()
            ) {
                score = this.terminalScore(chess, botColor, 1);
            } else {
                score = this.minimax(
                    chess,
                    this.SEARCH_DEPTH - 1,
                    -Infinity,
                    Infinity,
                    botColor,
                    1
                );
            }

            chess.undo();

            if (this.searchAborted) {
                break;
            }

            results.push({
                move,
                score,
                moveKey
            });
        }

        // Als de tijdslimiet geraakt werd, hebben we nog steeds
        // bruikbare resultaten van de reeds onderzochte zetten.
        results.sort((a, b) => b.score - a.score);

        return results.slice(0, amount);
    },

    // ------------------------------------------------------------
    // MINIMAX + ALPHA BETA
    // ------------------------------------------------------------

    minimax(chess, depth, alpha, beta, botColor, ply) {

        if (this.timeExceeded()) {
            this.searchAborted = true;
            return 0;
        }

        const key = this.positionKey(chess);
        const cached = this.transpositionTable.get(key);

        if (
            cached &&
            cached.depth >= depth
        ) {
            return cached.score;
        }

        if (chess.in_checkmate()) {
            return this.terminalScore(chess, botColor, ply);
        }

        if (
            chess.in_draw() ||
            chess.in_stalemate() ||
            chess.in_threefold_repetition() ||
            chess.insufficient_material()
        ) {
            return 0;
        }

        if (depth <= 0) {
            const score = this.evaluate(chess, botColor);
            this.transpositionTable.set(key, {
                depth,
                score
            });
            return score;
        }

        const moves = chess.moves({ verbose: true });

        if (!moves.length) {
            return this.evaluate(chess, botColor);
        }

        this.orderMoves(chess, moves, chess.turn());

        const maximizing = chess.turn() === botColor;

        let bestScore = maximizing
            ? -Infinity
            : Infinity;

        for (const move of moves) {

            if (this.timeExceeded()) {
                this.searchAborted = true;
                return bestScore === Infinity || bestScore === -Infinity
                    ? 0
                    : bestScore;
            }

            chess.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || "q"
            });

            const score = this.minimax(
                chess,
                depth - 1,
                alpha,
                beta,
                botColor,
                ply + 1
            );

            chess.undo();

            if (maximizing) {

                if (score > bestScore) {
                    bestScore = score;
                }

                alpha = Math.max(alpha, bestScore);

            } else {

                if (score < bestScore) {
                    bestScore = score;
                }

                beta = Math.min(beta, bestScore);
            }

            if (beta <= alpha) {

                // Killer move: zet die vaak voor een cutoff zorgt.
                const killerKey = `${depth}`;

                if (!this.killerMoves.has(killerKey)) {
                    this.killerMoves.set(killerKey, []);
                }

                const killers = this.killerMoves.get(killerKey);
                const key = this.moveKey(move);

                if (!killers.includes(key)) {
                    killers.unshift(key);

                    if (killers.length > 2) {
                        killers.pop();
                    }
                }

                break;
            }
        }

        this.transpositionTable.set(key, {
            depth,
            score: bestScore
        });

        return bestScore;
    },

    // ------------------------------------------------------------
    // EVALUATION
    // ------------------------------------------------------------

    evaluate(chess, botColor) {

        const opponent = botColor === "w" ? "b" : "w";

        let score = 0;

        // 1. Materiaal
        score += this.evaluateMaterial(chess, botColor);

        // 2. Ontwikkeling
        score += this.evaluateDevelopment(chess, botColor);

        // 3. Centrum
        score += this.evaluateCenter(chess, botColor);

        // 4. Aanval en activiteit
        score += this.evaluateActivity(chess, botColor);

        // 5. Verdediging / aangevallen stukken
        score += this.evaluatePieceSafety(chess, botColor);

        // 6. Koningveiligheid
        score += this.evaluateKingSafety(chess, botColor);

        // 7. Pionnenstructuur
        score += this.evaluatePawns(chess, botColor);

        // 8. Rokeren
        score += this.evaluateCastling(chess, botColor);

        // 9. Schaak
        if (chess.in_check()) {
            score += chess.turn() === botColor
                ? -120
                : 120;
        }

        // Kleine bonus voor activiteit.
        const ownMoves = this.getLegalMoves(chess, botColor);
        const enemyMoves = this.getLegalMoves(chess, opponent);

        score += (ownMoves.length - enemyMoves.length) * 2;

        return score;
    },

    // ------------------------------------------------------------
    // MATERIAL
    // ------------------------------------------------------------

    evaluateMaterial(chess, botColor) {

        let score = 0;

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const square = this.toSquare(row, col);
                const piece = chess.get(square);

                if (!piece) {
                    continue;
                }

                const value = this.VALUES[piece.type];

                if (piece.color === botColor) {
                    score += value;
                } else {
                    score -= value;
                }
            }
        }

        return score;
    },

    // ------------------------------------------------------------
    // DEVELOPMENT
    // ------------------------------------------------------------

    evaluateDevelopment(chess, botColor) {

        const opponent = botColor === "w" ? "b" : "w";

        let score = 0;

        score += this.developmentForColor(chess, botColor);
        score -= this.developmentForColor(chess, opponent);

        return score;
    },

    developmentForColor(chess, color) {

        let score = 0;

        const backRank = color === "w" ? 1 : 8;

        const pieces = [
            `b${backRank}`,
            `c${backRank}`,
            `f${backRank}`,
            `g${backRank}`
        ];

        for (const square of pieces) {

            const piece = chess.get(square);

            if (!piece || piece.color !== color) {
                score += 0;
                continue;
            }

            // Paarden en lopers die nog thuis staan.
            if (piece.type === "n" || piece.type === "b") {
                score -= 28;
            }
        }

        // Paarden/ lopers krijgen bonus als ze actief ontwikkeld zijn.
        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const square = this.toSquare(row, col);
                const piece = chess.get(square);

                if (!piece || piece.color !== color) {
                    continue;
                }

                if (piece.type === "n" || piece.type === "b") {

                    if (row >= 2 && row <= 5) {
                        score += 16;
                    }

                    const moves = chess.moves({
                        square,
                        verbose: true
                    });

                    score += Math.min(moves.length, 6) * 4;
                }
            }
        }

        return score;
    },

    // ------------------------------------------------------------
    // CENTER
    // ------------------------------------------------------------

    evaluateCenter(chess, botColor) {

        const center = [
            "d4",
            "e4",
            "d5",
            "e5"
        ];

        const extendedCenter = [
            "c3",
            "d3",
            "e3",
            "f3",
            "c4",
            "f4",
            "c5",
            "f5",
            "c6",
            "d6",
            "e6",
            "f6"
        ];

        let score = 0;

        for (const square of center) {

            const piece = chess.get(square);

            if (!piece) {
                continue;
            }

            if (piece.color === botColor) {
                score += piece.type === "p" ? 45 : 28;
            } else {
                score -= piece.type === "p" ? 45 : 28;
            }
        }

        for (const square of extendedCenter) {

            const piece = chess.get(square);

            if (!piece) {
                continue;
            }

            if (piece.color === botColor) {
                score += 9;
            } else {
                score -= 9;
            }
        }

        return score;
    },

    // ------------------------------------------------------------
    // ACTIVITY / ATTACK
    // ------------------------------------------------------------

    evaluateActivity(chess, botColor) {

        const opponent = botColor === "w" ? "b" : "w";

        let score = 0;

        const ownMoves = this.getLegalMoves(chess, botColor);
        const enemyMoves = this.getLegalMoves(chess, opponent);

        score += ownMoves.length * 3;
        score -= enemyMoves.length * 2;

        // Aanvallen van waardevolle stukken.
        for (const move of ownMoves) {

            if (move.captured) {

                const capturedValue =
                    this.VALUES[move.captured];

                score += Math.round(capturedValue * 0.12);
            }

            if (move.flags && move.flags.includes("c")) {
                score += 10;
            }
        }

        return score;
    },

    // ------------------------------------------------------------
    // PIECE SAFETY
    //
    // Dit is het belangrijkste nieuwe onderdeel.
    //
    // Voorbeeld:
    //
    // zwarte toren wordt aangevallen door witte pion
    // toren wordt verdedigd
    //
    // pion (100) -> toren (500)
    //
    // Als pion toren neemt en verdediger de pion terugneemt:
    // wit wint een toren voor een pion.
    //
    // Daarom krijgt Obsidian hiervoor een flinke straf.
    //
    // Maar:
    //
    // dame (900) -> toren (500)
    // verdediger neemt dame terug
    //
    // Dan wint Obsidian ongeveer 400 materiaal.
    //
    // Dus dat kan juist positief zijn.
    // ------------------------------------------------------------

    evaluatePieceSafety(chess, botColor) {

        const opponent = botColor === "w" ? "b" : "w";

        const ownAttacks = this.getAttackMap(chess, botColor);
        const enemyAttacks = this.getAttackMap(chess, opponent);

        let score = 0;

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const square = this.toSquare(row, col);
                const piece = chess.get(square);

                if (!piece || piece.color !== botColor) {
                    continue;
                }

                const attackers =
                    enemyAttacks.get(square) || [];

                const defenders =
                    ownAttacks.get(square) || [];

                const pieceValue = this.VALUES[piece.type];

                // Onbeschermd en aangevallen = heel slecht.
                if (attackers.length > 0 && defenders.length === 0) {

                    score -= this.hangingPenalty(pieceValue);
                    continue;
                }

                if (attackers.length === 0) {
                    // Een veilig actief stuk is positief.
                    score += Math.min(pieceValue / 40, 15);
                    continue;
                }

                // Er zijn zowel aanvallers als verdedigers.
                const tacticalScore =
                    this.evaluateExchangeRisk(
                        piece,
                        attackers,
                        defenders
                    );

                score += tacticalScore;
            }
        }

        return score;
    },

    evaluateExchangeRisk(piece, attackers, defenders) {

        const targetValue = this.VALUES[piece.type];

        // Goedkoopste aanvaller.
        const cheapestAttacker =
            this.cheapestPiece(attackers);

        // Goedkoopste verdediger.
        const cheapestDefender =
            this.cheapestPiece(defenders);

        if (!cheapestAttacker) {
            return 0;
        }

        const attackerValue =
            this.VALUES[cheapestAttacker.type];

        const defenderValue =
            cheapestDefender
                ? this.VALUES[cheapestDefender.type]
                : 0;

        // ------------------------------------------
        // Geval 1:
        // pion valt toren aan
        // ------------------------------------------

        if (attackerValue < targetValue) {

            const difference =
                targetValue - attackerValue;

            // Zelfs met verdediging kan de tegenstander
            // de toren voor een goedkope aanvaller ruilen.
            //
            // Hoe groter het verschil, hoe gevaarlijker.
            let penalty =
                Math.round(difference * 0.42);

            // Nog erger als de verdediger zelf duur is.
            if (
                defenderValue > 0 &&
                defenderValue < attackerValue
            ) {
                penalty += 15;
            }

            return -penalty;
        }

        // ------------------------------------------
        // Geval 2:
        // dame valt toren aan
        // ------------------------------------------

        if (attackerValue > targetValue) {

            // Tegenstander neemt een toren met een dame,
            // waarna onze verdediger de dame kan nemen.
            //
            // Dat is normaal gezien goed voor ons.
            const gain =
                Math.round((attackerValue - targetValue) * 0.32);

            return gain;
        }

        // Gelijke stukken.
        return 8;
    },

    hangingPenalty(value) {

        if (value >= 900) return 260;
        if (value >= 500) return 180;
        if (value >= 330) return 110;
        if (value >= 320) return 105;

        return 70;
    },

    cheapestPiece(pieces) {

        if (!pieces || !pieces.length) {
            return null;
        }

        let cheapest = pieces[0];

        for (const piece of pieces) {

            if (
                this.VALUES[piece.type] <
                this.VALUES[cheapest.type]
            ) {
                cheapest = piece;
            }
        }

        return cheapest;
    },

    // ------------------------------------------------------------
    // KING SAFETY
    // ------------------------------------------------------------

    evaluateKingSafety(chess, botColor) {

        const opponent = botColor === "w" ? "b" : "w";

        const ownKing = this.findKing(chess, botColor);
        const enemyKing = this.findKing(chess, opponent);

        let score = 0;

        if (!ownKing) {
            return -1000;
        }

        if (this.squareAttackedBy(chess, ownKing, opponent)) {
            score -= 150;
        } else {
            score += 30;
        }

        if (enemyKing) {

            const enemyAttackers =
                this.getAttackMap(chess, botColor)
                    .get(enemyKing) || [];

            score += enemyAttackers.length * 8;
        }

        return score;
    },

    // ------------------------------------------------------------
    // PAWNS
    // ------------------------------------------------------------

    evaluatePawns(chess, botColor) {

        const opponent = botColor === "w" ? "b" : "w";

        let score = 0;

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const square = this.toSquare(row, col);
                const piece = chess.get(square);

                if (!piece || piece.type !== "p") {
                    continue;
                }

                let value = 0;

                // Centrumspionnen zijn belangrijk.
                if (
                    square === "d4" ||
                    square === "e4" ||
                    square === "d5" ||
                    square === "e5"
                ) {
                    value += 25;
                }

                // Vrijpion-achtige bonus.
                const forward =
                    piece.color === "w" ? -1 : 1;

                const nextRow = row + forward;

                if (
                    nextRow >= 0 &&
                    nextRow <= 7
                ) {
                    value += 3;
                }

                if (piece.color === botColor) {
                    score += value;
                } else {
                    score -= value;
                }
            }
        }

        return score;
    },

    // ------------------------------------------------------------
    // CASTLING
    // ------------------------------------------------------------

    evaluateCastling(chess, botColor) {

        let score = 0;

        const history = chess.history();

        const hasCastled = history.some(move =>
            move === "O-O" ||
            move === "O-O-O"
        );

        if (hasCastled) {
            score += 80;
        }

        return score;
    },

    // ------------------------------------------------------------
    // MOVE ORDERING
    // ------------------------------------------------------------

    orderMoves(chess, moves, side) {

        moves.sort((a, b) => {

            const scoreA =
                this.moveOrderingScore(chess, a, side);

            const scoreB =
                this.moveOrderingScore(chess, b, side);

            return scoreB - scoreA;
        });
    },

    moveOrderingScore(chess, move, side) {

        let score = 0;

        // Captures eerst.
        if (move.captured) {

            const victim =
                this.VALUES[move.captured];

            const attacker =
                this.VALUES[move.piece];

            // MVV-LVA:
            // waardevol slachtoffer + goedkope aanvaller.
            score += victim * 10;
            score -= attacker * 0.4;
        }

        // Promotie.
        if (move.promotion) {
            score += 8000;
        }

        // Rokeren.
        if (
            move.flags &&
            move.flags.includes("k")
        ) {
            score += 600;
        }

        // Centrum.
        if (
            ["d4", "e4", "d5", "e5"].includes(move.to)
        ) {
            score += 180;
        }

        // Ontwikkeling.
        if (
            (move.piece === "n" || move.piece === "b") &&
            this.isDevelopmentMove(move)
        ) {
            score += 140;
        }

        // Killer moves.
        const killerList =
            this.killerMoves.get(`${this.SEARCH_DEPTH}`);

        if (
            killerList &&
            killerList.includes(this.moveKey(move))
        ) {
            score += 1000;
        }

        // Checks.
        if (this.moveGivesCheck(chess, move)) {
            score += 1200;
        }

        return score;
    },

    isDevelopmentMove(move) {

        if (move.piece !== "n" && move.piece !== "b") {
            return false;
        }

        const startingSquares = [
            "b1",
            "g1",
            "c1",
            "f1",
            "b8",
            "g8",
            "c8",
            "f8"
        ];

        return startingSquares.includes(move.from);
    },

    moveGivesCheck(chess, move) {

        chess.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || "q"
        });

        const check = chess.in_check();

        chess.undo();

        return check;
    },

    // ------------------------------------------------------------
    // ATTACK MAP
    // ------------------------------------------------------------

    getAttackMap(chess, color) {

        const map = new Map();
        const moves = this.getLegalMoves(chess, color);

        for (const move of moves) {

            if (!map.has(move.to)) {
                map.set(move.to, []);
            }

            map.get(move.to).push({
                type: move.piece,
                from: move.from
            });
        }

        return map;
    },

    getLegalMoves(chess, color) {

        const originalTurn = chess.turn();

        if (originalTurn === color) {
            return chess.moves({ verbose: true });
        }

        // chess.js genereert moves voor de side-to-move.
        // We moeten tijdelijk een positie met die kleur als turn
        // maken. FEN bevat de turn, dus we kunnen hiervoor een
        // gecontroleerde FEN-aanpassing doen.
        const fen = chess.fen().split(" ");

        fen[1] = color;

        const temp = new Chess(fen.join(" "));

        return temp.moves({ verbose: true });
    },

    squareAttackedBy(chess, square, color) {

        const moves = this.getLegalMoves(chess, color);

        return moves.some(move =>
            move.to === square
        );
    },

    // ------------------------------------------------------------
    // KING
    // ------------------------------------------------------------

    findKing(chess, color) {

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const square = this.toSquare(row, col);
                const piece = chess.get(square);

                if (
                    piece &&
                    piece.type === "k" &&
                    piece.color === color
                ) {
                    return square;
                }
            }
        }

        return null;
    },

    // ------------------------------------------------------------
    // TERMINAL POSITIONS
    // ------------------------------------------------------------

    terminalScore(chess, botColor, ply) {

        if (chess.in_checkmate()) {

            // Als het nu de bot zijn beurt is en hij schaakmat staat:
            if (chess.turn() === botColor) {
                return -1000000 + ply;
            }

            return 1000000 - ply;
        }

        return 0;
    },

    // ------------------------------------------------------------
    // HELPERS
    // ------------------------------------------------------------

    positionKey(chess) {

        // De eerste vier FEN-velden zijn voldoende voor
        // onze zoekboom: stukken, side to move, castling,
        // en en-passant.
        return chess.fen()
            .split(" ")
            .slice(0, 4)
            .join(" ");
    },

    moveKey(move) {
        return `${move.from}${move.to}${move.promotion || ""}`;
    },

    toSquare(row, col) {

        const files = "abcdefgh";

        return (
            files[col] +
            (8 - row)
        );
    },

    timeExceeded() {

        return (
            performance.now() -
            this.searchStart >
            this.MAX_SEARCH_TIME
        );
    }
};
