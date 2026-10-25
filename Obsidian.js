const Obsidian = {

    // Maximale diepte & tijd (dynamischer ingesteld)
    SEARCH_DEPTH: 12,
    MAX_SEARCH_TIME: 4000,

    DEFENSIVE_OPENING: 1,
    OPENING_MOVES: 12,

    ATTACK_SCALE: 1.0,
    DEFENSE_SCALE: 1.25,
    DANGER_CAP: 500,

    USE_BOOK: true,

    MATE: 100000,
    INF: 1000000,
    MAX_PLY: 64,

    // Transpositietabel-flags
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

    PASSED: [0, 10, 20, 35, 60, 100], // Verhoogde bonus voor vergevorderde vrijpionnen

    // ---------------------------------------------------------
    // STATE & OPTIMIZATIONS (Geheugen / GC minimalisatie)
    // ---------------------------------------------------------
    table: new Map(),
    killerMoves: Array(64).fill(null).map(() => [null, null]),
    history: new Int32Array(64 * 64), // Snellere TypedArray i.p.v. Map voor history heuristic

    startTime: 0,
    stopped: false,
    nodes: 0,
    lastDepth: 0,
    openingWeight: 1,
    botColor: "w",
    nullDepth: 0,
    timeLimit: 2500,

    // ---------------------------------------------------------
    // PIECE SQUARE TABLES (PST)
    // ---------------------------------------------------------
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
            this.table.clear(); // Geheugen-opschoning om geheugenlekkage te voorkomen
        }

        amount = Math.max(1, amount);
        this.botColor = chess.turn();

        if (this.USE_BOOK) {
            const book = this.bookMoves(chess);
            if (book) return book;
        }

        const fullmove = parseInt(chess.fen().split(" ")[5], 10) || 1;
        this.openingWeight = Math.max(0, 1 - (fullmove - 1) / this.OPENING_MOVES);

        if (this.openingWeight > 0) {
            this.table.clear();
        }

        const rootMoves = this.genMoves(chess);
        if (!rootMoves.length) return [];

        if (rootMoves.length === 1) {
            return [{ move: rootMoves[0], score: this.quickEval(chess, rootMoves[0]) }];
        }

        this.orderMoves(rootMoves, 0, null);
        let best = rootMoves.map(move => ({ move, score: 0 }));

        let prevKey = null;
        let prevScore = null;
        let lastIterMs = 0;
        let extended = false;

        // Iterative Deepening
        for (let depth = 1; depth <= this.SEARCH_DEPTH; depth++) {
            const elapsed = performance.now() - this.startTime;

            if (amount > 1 && depth > 3 && elapsed + lastIterMs * 2.2 > this.timeLimit) {
                break;
            }

            const iterStart = performance.now();
            this.stopped = false;

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

            lastIterMs = performance.now() - iterStart;
            const topKey = this.moveKey(results[0].move);

            if (!extended && depth >= 4 && prevKey !== null && (topKey !== prevKey || results[0].score < prevScore - 40)) {
                extended = true;
                this.timeLimit = this.MAX_SEARCH_TIME * 1.5;
            }

            prevKey = topKey;
            prevScore = results[0].score;

            const scores = new Map(results.map(r => [this.moveKey(r.move), r.score]));
            rootMoves.sort((a, b) => {
                const kA = this.moveKey(a), kB = this.moveKey(b);
                return (scores.get(kB) || -2 * this.INF) - (scores.get(kA) || -2 * this.INF);
            });

            if (results[0].score > this.MATE - 100) break;
        }

        best.sort((a, b) => b.score - a.score);
        return best.slice(0, amount);
    },

    // ---------------------------------------------------------
    // VERBETERDE HISTORIE & KILLER MANAGEMENT
    // ---------------------------------------------------------
    getSquareIndex(sq) {
        return (sq.charCodeAt(0) - 97) + (8 - parseInt(sq[1], 10)) * 8;
    },

    updateHistory(move, depth) {
        const from = this.getSquareIndex(move.from);
        const to = this.getSquareIndex(move.to);
        this.history[from * 64 + to] += depth * depth;
    },

    storeKiller(move, ply) {
        if (ply >= 0 && ply < 64) {
            if (this.killerMoves[ply][0] !== move) {
                this.killerMoves[ply][1] = this.killerMoves[ply][0];
                this.killerMoves[ply][0] = move;
            }
        }
    },

    // ---------------------------------------------------------
    // OPENINGSBOEK & SEARCH EXTENSIONS
    // ---------------------------------------------------------
    bookTree: null,
    BOOK_LINES: [
        "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7",
        "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8 Kxd8",
        "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7",
        "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 exd5 Bd3 Bb7 O-O Nbd7",
        "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7",
        "d4 d5 Nf3 Nf6 Bf4 e6 e3 Bd6 Bg3 O-O Nbd2 c5 c3 Nc6 Bd3 Qe7"
    ],

    buildBook() {
        const tree = new Map();
        for (const line of this.BOOK_LINES) {
            const mv = line.split(" ");
            for (let i = 0; i < mv.length; i++) {
                const key = mv.slice(0, i).join(" ");
                let node = tree.get(key);
                if (!node) {
                    node = new Map();
                    tree.set(key, node);
                }
                node.set(mv[i], (node.get(mv[i]) || 0) + 1);
            }
        }
        this.bookTree = tree;
    },

    bookMoves(chess) {
        if (!this.bookTree) this.buildBook();
        const hist = chess.history().map(m => m.replace(/[+#]/g, ""));
        if (hist.length > 20) return null;

        const node = this.bookTree.get(hist.join(" "));
        if (!node) return null;

        const full = chess.moves({ verbose: true });
        const cands = [];
        for (const [san, count] of node) {
            const m = full.find(x => x.san.replace(/[+#]/g, "") === san);
            if (m) cands.push({ move: m, weight: count });
        }

        if (!cands.length) return null;
        return cands.slice(0, 3).map(c => ({ move: c.move, score: this.quickEval(chess, c.move) }));
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

        if (ply > 0 && (ply <= 3 && this.nullDepth === 0 ? chess.in_draw() : chess.insufficient_material())) {
            return 0;
        }

        let inCheck = chess.in_check();

        // Singularity / Check Extensions (Verhoogt speurdiepte bij schaak of gedwongen situaties)
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

        // Null-Move Pruning geoptimaliseerd
        if (allowNull && depth >= 3 && !inCheck && ply > 0 && Math.abs(beta) < this.MATE - 1000 && this.evaluate(chess) >= beta) {
            const nullBoard = this.passMove(chess);
            if (nullBoard) {
                this.nullDepth++;
                const R = depth > 6 ? 3 : 2;
                const nullScore = -this.search(nullBoard, depth - 1 - R, -beta, -beta + 1, ply + 1, false);
                this.nullDepth--;

                if (this.stopped) return 0;
                if (nullScore >= beta) {
                    return nullScore >= this.MATE - 1000 ? beta : nullScore;
                }
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
                // Verbeterde LMR (Late Move Reduction)
                if (depth >= 3 && i >= 3 && quiet && !inCheck) {
                    reduction = (i >= 6) ? 2 : 1;
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
                if (quiet) {
                    this.storeKiller(move, ply);
                    this.updateHistory(move, depth);
                }
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
            // Delta pruning (snoei nutteloze ruilacties in quiescence)
            if (!inCheck && !move.promotion && stand + this.VALUES[move.captured] + 250 < alpha) {
                continue;
            }

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
