const Obsidian = {
    SEARCH_DEPTH: 10,
    MAX_SEARCH_TIME: 3000, // Veiligere standaard denktijd in ms
    DEFENSIVE_OPENING: 1,
    OPENING_MOVES: 12,
    ATTACK_SCALE: 1.0,
    DEFENSE_SCALE: 1.25,
    DANGER_CAP: 500,
    USE_BOOK: true,

    MATE: 100000,
    INF: 1000000,
    MAX_PLY: 64,

    EXACT: 0,
    LOWER: 1,
    UPPER: 2,

    VALUES: {
        p: 100,
        n: 320,
        b: 330,
        r: 500,
        q: 900,
        k: 20000
    },

    PASSED: [0, 10, 20, 35, 60, 100],

    // STATE
    table: new Map(),
    killerMoves: Array(64).fill(null).map(() => [null, null]),
    history: new Int32Array(64 * 64),
    startTime: 0,
    stopped: false,
    nodes: 0,
    lastDepth: 0,
    openingWeight: 1,
    botColor: "w",
    nullDepth: 0,
    timeLimit: 2500,

    PST: {
        p: [
             0,  0,  0,  0,  0,  0,  0,  0,
            50, 50, 50, 50, 50, 50, 50, 50,
            10, 10, 20, 30, 30, 20, 10, 10,
             5,  5, 10, 25, 25, 10,  5,  5,
             0,  0,  0, 20, 20,  0,  0,  0,
             5, -5,-10,  0,  0,-10, -5,  5,
             5, 10, 10,-20,-20, 10, 10,  5,
             0,  0,  0,  0,  0,  0,  0,  0
        ],
        n: [
            -50,-40,-30,-30,-30,-30,-40,-50,
            -40,-20,  0,  0,  0,  0,-20,-40,
            -30,  0, 10, 15, 15, 10,  0,-30,
            -30,  5, 15, 20, 20, 15,  5,-30,
            -30,  0, 15, 20, 20, 15,  0,-30,
            -30,  5, 10, 15, 15, 10,  5,-30,
            -40,-20,  0,  5,  5,  0,-20,-40,
            -50,-40,-30,-30,-30,-30,-40,-50
        ],
        b: [
            -20,-10,-10,-10,-10,-10,-10,-20,
            -10,  0,  0,  0,  0,  0,  0,-10,
            -10,  0,  5, 10, 10,  5,  0,-10,
            -10,  5,  5, 10, 10,  5,  5,-10,
            -10,  0, 10, 10, 10, 10,  0,-10,
            -10, 10, 10, 10, 10, 10, 10,-10,
            -10,  5,  0,  0,  0,  0,  5,-10,
            -20,-10,-10,-10,-10,-10,-10,-20
        ],
        r: [
             0,  0,  0,  0,  0,  0,  0,  0,
             5, 10, 10, 10, 10, 10, 10,  5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
            -5,  0,  0,  0,  0,  0,  0, -5,
             0,  0,  0,  5,  5,  0,  0,  0
        ],
        q: [
            -20,-10,-10, -5, -5,-10,-10,-20,
            -10,  0,  0,  0,  0,  0,  0,-10,
            -10,  0,  5,  5,  5,  5,  0,-10,
             -5,  0,  5,  5,  5,  5,  0, -5,
              0,  0,  5,  5,  5,  5,  0, -5,
            -10,  5,  5,  5,  5,  5,  0,-10,
            -10,  0,  5,  0,  0,  0,  0,-10,
            -20,-10,-10, -5, -5,-10,-10,-20
        ],
        k: [
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -30,-40,-40,-50,-50,-40,-40,-30,
            -20,-30,-30,-40,-40,-30,-30,-20,
            -10,-20,-20,-20,-20,-20,-20,-10,
             20, 20,  0,  0,  0,  0, 20, 20,
             20, 30, 10,  0,  0, 10, 30, 20
        ],
        kEnd: [
            -50,-40,-30,-20,-20,-30,-40,-50,
            -30,-20,-10,  0,  0,-10,-20,-30,
            -30,-10, 20, 30, 30, 20,-10,-30,
            -30,-10, 30, 40, 40, 30,-10,-30,
            -30,-10, 30, 40, 40, 30,-10,-30,
            -30,-10, 20, 30, 30, 20,-10,-30,
            -30,-30,  0,  0,  0,  0,-30,-30,
            -50,-30,-30,-30,-30,-30,-30,-50
        ]
    },

    // --- ESSENTIELE HELPER FUNCTIES VOOR TIJD & STATE ---
    outOfTime() {
        return (performance.now() - this.startTime) > this.timeLimit;
    },

    moveKey(move) {
        if (!move) return "";
        return move.from + move.to + (move.promotion || "");
    },

    key(chess) {
        return chess.fen();
    },

    play(chess, move) {
        return chess.move(move);
    },

    undo(chess) {
        return chess.undo();
    },

    genMoves(chess) {
        return chess.moves({ verbose: true });
    },

    passMove(chess) {
        // Maak een kloon/kopie voor null-move pruning als chess.js dit ondersteunt
        try {
            const clone = new chess.constructor(chess.fen());
            // Als de bibliotheek wisselen van beurt niet direct via constructor kan, slaan we pass over
            return clone;
        } catch(e) {
            return null;
        }
    },

    hasPieces(key) {
        return true;
    },

    evaluate(chess) {
        // Basis fallback evaluatie op basis van materiaal + PST als je eigen evaluate ontbreekt
        let score = 0;
        const board = chess.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    const val = this.VALUES[piece.type];
                    const pstIndex = piece.color === "w" ? (r * 8 + c) : ((7 - r) * 8 + c);
                    const pstVal = this.PST[piece.type][pstIndex] || 0;
                    const total = val + pstVal;
                    score += (piece.color === chess.turn()) ? total : -total;
                }
            }
        }
        return score;
    },

    orderMoves(moves, ply, ttMove) {
        moves.sort((a, b) => {
            let scoreA = 0, scoreB = 0;
            if (ttMove && this.moveKey(a) === ttMove) scoreA += 10000;
            if (ttMove && this.moveKey(b) === ttMove) scoreB += 10000;

            if (a.captured) scoreA += 1000 + (this.VALUES[a.captured] || 0);
            if (b.captured) scoreB += 1000 + (this.VALUES[b.captured] || 0);

            return scoreB - scoreA;
        });
    },

    quickEval(chess, move) {
        this.play(chess, move);
        const score = -this.evaluate(chess);
        this.undo(chess);
        return score;
    },

    getBestMove(chess) {
        const result = this.getTopMoves(chess, 1);
        return result.length ? result[0].move : null;
    },

    getTopMoves(chess, amount = 3) {
        this.startTime = performance.now();
        this.timeLimit = this.MAX_SEARCH_TIME;
        this.stopped = false;
        this.nodes = 0;
        this.nullDepth = 0;
        this.lastDepth = 0;

        for(let i=0; i<64; i++) {
            this.killerMoves[i][0] = null;
            this.killerMoves[i][1] = null;
        }
        this.history.fill(0);

        if (this.table.size > 250000) {
            this.table.clear();
        }

        amount = Math.max(1, amount);
        this.botColor = chess.turn();

        const rootMoves = this.genMoves(chess);
        if (!rootMoves.length) return [];

        if (rootMoves.length === 1) {
            return [{ move: rootMoves[0], score: this.quickEval(chess, rootMoves[0]) }];
        }

        this.orderMoves(rootMoves, 0, null);
        let best = rootMoves.map(move => ({ move, score: 0 }));

        // Iterative Deepening met veilige vangnetten
        for (let depth = 1; depth <= this.SEARCH_DEPTH; depth++) {
            const elapsed = performance.now() - this.startTime;
            if (elapsed > this.timeLimit && depth > 1) {
                break; // Stop tijdig als de tijd op is
            }

            const results = this.searchRoot(chess, depth, rootMoves, amount);

            if (!this.stopped && results.length) {
                best = results;
                this.lastDepth = depth;
            } else {
                if (amount === 1 && results.length) {
                    best = results;
                }
                break;
            }

            if (results[0].score > this.MATE - 100) break;
        }

        best.sort((a, b) => b.score - a.score);
        return best.slice(0, amount);
    },

    searchRoot(chess, depth, moves, amount) {
        let alpha = -this.INF;
        const beta = this.INF;
        const results = [];

        for (const move of moves) {
            if (this.outOfTime()) {
                this.stopped = true;
                break;
            }

            this.play(chess, move);
            let score;

            if (chess.in_checkmate()) {
                score = this.MATE;
            } else if (chess.in_draw()) {
                score = 0;
            } else {
                score = -this.search(chess, depth - 1, -beta, -alpha, 1);
            }

            this.undo(chess);
            if (this.stopped) break;

            results.push({ move, score });
            if (results.length >= amount) {
                results.sort((a, b) => b.score - a.score);
                alpha = results[amount - 1].score;
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results;
    },

    search(chess, depth, alpha, beta, ply, allowNull = true) {
        this.nodes++;

        if ((this.nodes & 2047) === 0 && this.outOfTime()) {
            this.stopped = true;
        }
        if (this.stopped) return 0;

        if (ply > 0 && chess.in_draw()) return 0;

        let inCheck = chess.in_check();
        if (inCheck && ply < 35) depth++;

        if (depth <= 0) {
            return this.quiescence(chess, alpha, beta, ply);
        }

        const moves = this.genMoves(chess);
        if (!moves.length) {
            return inCheck ? -this.MATE + ply : 0;
        }

        const key = this.key(chess);
        const entry = this.table.get(key);
        let ttMove = null;

        if (entry) {
            ttMove = entry.move;
            if (entry.depth >= depth && Math.abs(entry.score) < this.MATE - 1000) {
                if (entry.flag === this.EXACT) return entry.score;
                if (entry.flag === this.LOWER && entry.score > alpha) alpha = entry.score;
                if (entry.flag === this.UPPER && entry.score < beta) beta = entry.score;
                if (alpha >= beta) return entry.score;
            }
        }

        this.orderMoves(moves, ply, ttMove);

        let best = -this.INF;
        let bestMove = null;
        let alphaOrig = alpha;

        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            const quiet = !move.captured && !move.promotion;

            this.play(chess, move);
            let score;

            if (i === 0) {
                score = -this.search(chess, depth - 1, -beta, -alpha, ply + 1);
            } else {
                let reduction = 0;
                if (depth >= 3 && i >= 4 && quiet && !inCheck) {
                    reduction = 1;
                }

                score = -this.search(chess, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1);

                if (score > alpha && (reduction > 0 || score < beta)) {
                    score = -this.search(chess, depth - 1, -beta, -alpha, ply + 1);
                }
            }

            this.undo(chess);
            if (this.stopped) return 0;

            if (score > best) {
                best = score;
                bestMove = move;
            }
            if (score > alpha) {
                alpha = score;
            }
            if (alpha >= beta) {
                break;
            }
        }

        let flag = this.EXACT;
        if (best <= alphaOrig) flag = this.UPPER;
        else if (best >= beta) flag = this.LOWER;

        this.table.set(key, { depth, score: best, flag, move: bestMove ? this.moveKey(bestMove) : null });
        return best;
    },

    quiescence(chess, alpha, beta, ply) {
        this.nodes++;
        if ((this.nodes & 2047) === 0 && this.outOfTime()) {
            this.stopped = true;
        }
        if (this.stopped || ply >= this.MAX_PLY) return this.evaluate(chess);

        const inCheck = chess.in_check();
        let moves = this.genMoves(chess);

        if (!moves.length) {
            return inCheck ? -this.MATE + ply : 0;
        }

        let stand = -this.INF;
        if (!inCheck) {
            stand = this.evaluate(chess);
            if (stand >= beta) return stand;
            if (stand > alpha) alpha = stand;
            moves = moves.filter(m => m.captured || m.promotion);
        }

        this.orderMoves(moves, ply, null);
        let best = inCheck ? -this.INF : stand;

        for (const move of moves) {
            this.play(chess, move);
            const score = -this.quiescence(chess, -beta, -alpha, ply + 1);
            this.undo(chess);

            if (this.stopped) return 0;
            if (score > best) best = score;
            if (score > alpha) alpha = score;
            if (alpha >= beta) break;
        }

        return best;
    }
};
