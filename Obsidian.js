const Obsidian = {

    // Maximale diepte. De zoektijd bepaalt in de praktijk hoe diep hij komt.
    SEARCH_DEPTH: 6,

    // Maximale denktijd per zet (ms).
    MAX_SEARCH_TIME: 2800,

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

    // Passed pawn bonus per gevorderde rij (0..5)
    PASSED: [0, 5, 10, 20, 40, 70],

    // ---------------------------------------------------------
    // STATE
    // ---------------------------------------------------------

    table: new Map(),
    killerMoves: [],
    history: new Map(),

    startTime: 0,
    stopped: false,
    nodes: 0,
    lastDepth: 0,

    // ---------------------------------------------------------
    // PIECE SQUARE TABLES (vanuit wit, index 0 = a8)
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

        // Koning in middenspel: veilig achter de pionnen.
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

        // Koning in eindspel: naar het centrum.
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

    // ---------------------------------------------------------
    // PUBLIC
    // ---------------------------------------------------------

    getBestMove(chess) {

        const result = this.getTopMoves(chess, 1);

        return result.length
            ? result[0].move
            : null;
    },

    getTopMoves(chess, amount = 3) {

        this.startTime = performance.now();
        this.stopped = false;
        this.nodes = 0;
        this.lastDepth = 0;

        this.killerMoves = [];
        this.history.clear();

        if (this.table.size > 300000) {
            this.table.clear();
        }

        amount = Math.max(1, amount);

        const rootMoves = chess.moves({ verbose: true });

        if (!rootMoves.length) {
            return [];
        }

        // Veilige fallback: er is altijd minstens één zet.
        this.orderMoves(rootMoves, 0, null);

        let best = rootMoves.map(move => ({ move, score: 0 }));

        for (let depth = 1; depth <= this.SEARCH_DEPTH; depth++) {

            this.stopped = false;

            const results = this.searchRoot(
                chess,
                depth,
                rootMoves,
                amount
            );

            if (!this.stopped && results.length) {

                // Volledige diepte afgerond.
                best = results;
                this.lastDepth = depth;

            } else {

                // Halve diepte: bij één zet mag je het deelresultaat
                // gebruiken, want de beste zet van de vorige laag werd
                // als eerste doorgerekend.
                if (amount === 1 && results.length) {
                    best = results;
                }

                break;
            }

            // Volgende laag: beste zetten van deze laag eerst.
            const scores = new Map(
                results.map(r => [this.moveKey(r.move), r.score])
            );

            const scoreOf = m => {
                const k = this.moveKey(m);
                return scores.has(k) ? scores.get(k) : -2 * this.INF;
            };

            rootMoves.sort((a, b) => scoreOf(b) - scoreOf(a));

            // Mat gevonden: dieper zoeken heeft geen zin.
            if (results[0].score > this.MATE - 100) {
                break;
            }
        }

        best.sort((a, b) => b.score - a.score);

        return best.slice(0, amount);
    },

    // ---------------------------------------------------------
    // ROOT SEARCH
    // ---------------------------------------------------------

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

                score = -this.search(
                    chess,
                    depth - 1,
                    -beta,
                    -alpha,
                    1
                );
            }

            chess.undo();

            if (this.stopped) {
                break;
            }

            results.push({ move, score });

            // Alpha = score van de N-de beste zet, zodat de top-N
            // exacte scores heeft en de rest snel wordt afgekapt.
            if (results.length >= amount) {
                results.sort((a, b) => b.score - a.score);
                alpha = results[amount - 1].score;
            }
        }

        results.sort((a, b) => b.score - a.score);

        return results;
    },

    // ---------------------------------------------------------
    // NEGAMAX + ALPHA BETA (PVS, LMR, check-extensie, TT)
    //
    // Score is ALTIJD vanuit de speler die aan zet is.
    // ---------------------------------------------------------

    search(chess, depth, alpha, beta, ply) {

        this.nodes++;

        if ((this.nodes & 2047) === 0 && this.outOfTime()) {
            this.stopped = true;
        }

        if (this.stopped) {
            return 0;
        }

        // Remise. in_draw() (incl. herhaling) is duur, dus alleen dicht
        // bij de root; dieper alleen onvoldoende materiaal.
        if (ply > 0) {
            const draw = ply <= 3
                ? chess.in_draw()
                : chess.insufficient_material();

            if (draw) {
                return 0;
            }
        }

        const inCheck = chess.in_check();

        // Schaak-extensie.
        if (inCheck && ply < 30) {
            depth++;
        }

        if (depth <= 0) {
            return this.quiescence(chess, alpha, beta, ply);
        }

        const moves = chess.moves({ verbose: true });

        if (!moves.length) {
            return inCheck
                ? -this.MATE + ply
                : 0;
        }

        // Transpositietabel.
        const alphaOrig = alpha;
        const key = this.key(chess);
        const entry = this.table.get(key);

        let ttMove = null;

        if (entry) {

            ttMove = entry.move;

            if (
                entry.depth >= depth &&
                Math.abs(entry.score) < this.MATE - 1000
            ) {
                if (entry.flag === this.EXACT) {
                    return entry.score;
                }

                if (entry.flag === this.LOWER) {
                    if (entry.score > alpha) alpha = entry.score;
                } else if (entry.score < beta) {
                    beta = entry.score;
                }

                if (alpha >= beta) {
                    return entry.score;
                }
            }
        }

        this.orderMoves(moves, ply, ttMove);

        let best = -this.INF;
        let bestMove = null;

        for (let i = 0; i < moves.length; i++) {

            const move = moves[i];
            const quiet = !move.captured && !move.promotion;

            this.play(chess, move);

            let score;

            if (i === 0) {

                score = -this.search(
                    chess, depth - 1, -beta, -alpha, ply + 1
                );

            } else {

                // Late move reduction: late, rustige zetten minder diep.
                let reduction = 0;

                if (
                    depth >= 3 &&
                    i >= 4 &&
                    quiet &&
                    !inCheck &&
                    !chess.in_check()
                ) {
                    reduction = 1;
                }

                // Null-window zoekopdracht, daarna pas volledig als
                // de zet toch beter blijkt.
                score = -this.search(
                    chess, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1
                );

                if (score > alpha && (reduction > 0 || score < beta)) {
                    score = -this.search(
                        chess, depth - 1, -beta, -alpha, ply + 1
                    );
                }
            }

            chess.undo();

            if (this.stopped) {
                return 0;
            }

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

        if (best <= alphaOrig) {
            flag = this.UPPER;
        } else if (best >= beta) {
            flag = this.LOWER;
        }

        this.table.set(key, {
            depth,
            score: best,
            flag,
            move: bestMove ? this.moveKey(bestMove) : null
        });

        return best;
    },

    // ---------------------------------------------------------
    // QUIESCENCE (alleen slagzetten/promoties, alle zetten bij schaak)
    // ---------------------------------------------------------

    quiescence(chess, alpha, beta, ply) {

        this.nodes++;

        if ((this.nodes & 2047) === 0 && this.outOfTime()) {
            this.stopped = true;
        }

        if (this.stopped) {
            return 0;
        }

        if (ply >= this.MAX_PLY) {
            return this.evaluate(chess);
        }

        const inCheck = chess.in_check();

        let moves = chess.moves({ verbose: true });

        if (!moves.length) {
            return inCheck
                ? -this.MATE + ply
                : 0;
        }

        let stand = -this.INF;

        if (!inCheck) {

            stand = this.evaluate(chess);

            if (stand >= beta) {
                return stand;
            }

            if (stand > alpha) {
                alpha = stand;
            }

            moves = moves.filter(m => m.captured || m.promotion);
        }

        this.orderMoves(moves, ply, null);

        let best = inCheck ? -this.INF : stand;

        for (const move of moves) {

            // Delta pruning: deze slag kan alpha toch niet meer halen.
            if (
                !inCheck &&
                !move.promotion &&
                stand + this.VALUES[move.captured] + 200 < alpha
            ) {
                continue;
            }

            this.play(chess, move);

            const score = -this.quiescence(
                chess, -beta, -alpha, ply + 1
            );

            chess.undo();

            if (this.stopped) {
                return 0;
            }

            if (score > best) {
                best = score;
            }

            if (score > alpha) {
                alpha = score;
            }

            if (alpha >= beta) {
                break;
            }
        }

        return best;
    },

    // ---------------------------------------------------------
    // EVALUATION
    //
    // Eén doorloop over het bord. Geeft de score terug vanuit de
    // speler die aan zet is (dat vereist negamax).
    // ---------------------------------------------------------

    evaluate(chess) {

        const board = chess.board();

        let score = 0;   // vanuit wit
        let npm = 0;     // niet-pion materiaal (beide kanten)

        const pawnRows = {
            w: Array.from({ length: 8 }, () => []),
            b: Array.from({ length: 8 }, () => [])
        };

        const bishops = { w: 0, b: 0 };
        const rooks = [];
        const kings = {};

        for (let r = 0; r < 8; r++) {

            for (let c = 0; c < 8; c++) {

                const p = board[r][c];

                if (!p) {
                    continue;
                }

                const sign = p.color === "w" ? 1 : -1;

                const idx = p.color === "w"
                    ? r * 8 + c
                    : (7 - r) * 8 + c;

                if (p.type === "k") {
                    kings[p.color] = { r, c, idx };
                    continue;
                }

                score += sign * (
                    this.VALUES[p.type] + this.PST[p.type][idx]
                );

                if (p.type === "p") {
                    pawnRows[p.color][c].push(r);
                    continue;
                }

                npm += this.VALUES[p.type];

                if (p.type === "b") bishops[p.color]++;
                if (p.type === "r") rooks.push({ color: p.color, c });
            }
        }

        // 1 = middenspel, 0 = eindspel.
        const mg = Math.min(1, npm / 6000);

        // Koning: PST tussen middenspel en eindspel + pionnenschild.
        for (const color of ["w", "b"]) {

            const k = kings[color];

            if (!k) {
                continue;
            }

            const sign = color === "w" ? 1 : -1;

            score += sign * Math.round(
                mg * this.PST.k[k.idx] +
                (1 - mg) * this.PST.kEnd[k.idx]
            );

            if (mg > 0.4) {

                const dir = color === "w" ? -1 : 1;
                let shield = 0;

                for (let dc = -1; dc <= 1; dc++) {

                    const f = k.c + dc;

                    if (f < 0 || f > 7) {
                        continue;
                    }

                    for (const step of [1, 2]) {
                        if (pawnRows[color][f].includes(k.r + dir * step)) {
                            shield++;
                            break;
                        }
                    }
                }

                score += sign * Math.round(shield * 10 * mg);
            }
        }

        // Pionnenstructuur.
        for (const color of ["w", "b"]) {

            const sign = color === "w" ? 1 : -1;
            const enemy = color === "w" ? "b" : "w";
            const own = pawnRows[color];
            const opp = pawnRows[enemy];

            for (let f = 0; f < 8; f++) {

                const n = own[f].length;

                if (!n) {
                    continue;
                }

                // Dubbele pionnen.
                if (n > 1) {
                    score -= sign * 12 * (n - 1);
                }

                // Geïsoleerde pionnen.
                const isolated =
                    (f === 0 || own[f - 1].length === 0) &&
                    (f === 7 || own[f + 1].length === 0);

                if (isolated) {
                    score -= sign * 15 * n;
                }

                // Vrijpionnen.
                for (const r of own[f]) {

                    let passed = true;

                    for (let df = -1; df <= 1 && passed; df++) {

                        const ff = f + df;

                        if (ff < 0 || ff > 7) {
                            continue;
                        }

                        for (const er of opp[ff]) {
                            if (color === "w" ? er < r : er > r) {
                                passed = false;
                                break;
                            }
                        }
                    }

                    if (passed) {
                        const adv = color === "w" ? 6 - r : r - 1;
                        score += sign * (this.PASSED[adv] || 0);
                    }
                }
            }
        }

        // Torens op open / halfopen lijnen.
        for (const rook of rooks) {

            const sign = rook.color === "w" ? 1 : -1;
            const enemy = rook.color === "w" ? "b" : "w";

            const own = pawnRows[rook.color][rook.c].length;
            const opp = pawnRows[enemy][rook.c].length;

            if (!own && !opp) {
                score += sign * 15;
            } else if (!own) {
                score += sign * 8;
            }
        }

        // Loperpaar.
        if (bishops.w >= 2) score += 30;
        if (bishops.b >= 2) score -= 30;

        // Naar de kant van de speler die aan zet is + kleine tempo-bonus.
        return (chess.turn() === "w" ? score : -score) + 10;
    },

    // ---------------------------------------------------------
    // MOVE ORDERING (score wordt één keer per zet berekend)
    // ---------------------------------------------------------

    orderMoves(moves, ply, ttKey) {

        const scored = moves.map(m => ({
            m,
            s: this.moveScore(m, ply, ttKey)
        }));

        scored.sort((a, b) => b.s - a.s);

        for (let i = 0; i < moves.length; i++) {
            moves[i] = scored[i].m;
        }
    },

    moveScore(move, ply, ttKey) {

        const key = this.moveKey(move);

        // Beste zet uit de transpositietabel eerst.
        if (ttKey && key === ttKey) {
            return 10000000;
        }

        let s = 0;

        if (move.captured) {

            // MVV-LVA: dure slachtoffers met goedkope stukken eerst.
            s = 100000 +
                this.VALUES[move.captured] * 10 -
                this.VALUES[move.piece];

        } else {

            const killers = this.killerMoves[ply];

            if (killers) {
                if (killers[0] === key) s += 90000;
                else if (killers[1] === key) s += 80000;
            }

            s += this.history.get(key) || 0;
        }

        if (move.promotion) {
            s += 95000 + this.VALUES[move.promotion];
        }

        return s;
    },

    // ---------------------------------------------------------
    // KILLER / HISTORY
    // ---------------------------------------------------------

    storeKiller(move, ply) {

        const key = this.moveKey(move);

        if (!this.killerMoves[ply]) {
            this.killerMoves[ply] = [];
        }

        const list = this.killerMoves[ply];

        if (!list.includes(key)) {
            list.unshift(key);
        }

        if (list.length > 2) {
            list.pop();
        }
    },

    updateHistory(move, depth) {

        const key = this.moveKey(move);
        const old = this.history.get(key) || 0;

        this.history.set(key, Math.min(old + depth * depth, 10000));
    },

    // ---------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------

    play(chess, move) {

        chess.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || "q"
        });
    },

    // FEN zonder zetteller: dezelfde stelling = dezelfde sleutel.
    key(chess) {

        return chess.fen().split(" ").slice(0, 4).join(" ");
    },

    moveKey(move) {

        return move.from + move.to + (move.promotion || "");
    },

    outOfTime() {

        return (
            performance.now() - this.startTime >= this.MAX_SEARCH_TIME
        );
    }
};
