const Obsidian = {

    // =========================================================
    // CONFIG
    // =========================================================

    SEARCH_DEPTH: 10,
    MAX_SEARCH_TIME: 3500,

    // 0 = uit
    // 1 = normaal defensief
    // 2 = zeer defensief
    DEFENSIVE_OPENING: 1,

    OPENING_MOVES: 12,

    MATE: 100000,
    INF: 1000000,
    MAX_PLY: 64,

    EXACT: 0,
    LOWER: 1,
    UPPER: 2,

    VALUES: {
        p: 100,
        n: 320,
        b: 335,
        r: 500,
        q: 900,
        k: 20000
    },

    PASSED: [0, 5, 10, 20, 40, 70],

    // =========================================================
    // STATE
    // =========================================================

    table: new Map(),
    killerMoves: [],
    history: new Map(),

    startTime: 0,
    stopped: false,
    nodes: 0,
    lastDepth: 0,
    openingWeight: 1,

    // =========================================================
    // PIECE SQUARE TABLES
    // index 0 = a8
    // =========================================================

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
              0,  0,  5,  5,  5,  5,  0, -10,
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

    // =========================================================
    // PUBLIC API
    // =========================================================

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

        if (this.table.size > 350000) {
            this.table.clear();
        }

        amount = Math.max(1, Math.min(3, amount));

        const fullmove =
            parseInt(chess.fen().split(" ")[5], 10) || 1;

        this.openingWeight = Math.max(
            0,
            1 - (fullmove - 1) / this.OPENING_MOVES
        );

        // Tijdens de opening verandert de evaluatie snel.
        if (this.openingWeight > 0) {
            this.table.clear();
        }

        const rootMoves =
            chess.moves({ verbose: true });

        if (!rootMoves.length) {
            return [];
        }

        this.orderMoves(rootMoves, 0, null);

        // Veilige fallback.
        let best = rootMoves.map(move => ({
            move,
            score: 0
        }));

        for (
            let depth = 1;
            depth <= this.SEARCH_DEPTH;
            depth++
        ) {

            this.stopped = false;

            const results = this.searchRoot(
                chess,
                depth,
                rootMoves
            );

            if (
                !this.stopped &&
                results.length
            ) {

                best = results;
                this.lastDepth = depth;

            } else {

                // Gebruik nooit een half afgemaakte diepe zoeklaag
                // als die niet volledig klaar was.
                break;
            }

            const scores = new Map(
                results.map(r => [
                    this.moveKey(r.move),
                    r.score
                ])
            );

            rootMoves.sort(
                (a, b) =>
                    (scores.get(this.moveKey(b)) ?? -this.INF) -
                    (scores.get(this.moveKey(a)) ?? -this.INF)
            );

            // Directe mat gevonden.
            if (
                results[0] &&
                results[0].score > this.MATE - 100
            ) {
                break;
            }
        }

        best.sort((a, b) => b.score - a.score);

        return best.slice(0, amount);
    },

    // =========================================================
    // ROOT SEARCH
    // =========================================================

    searchRoot(chess, depth, moves) {

        let alpha = -this.INF;
        const beta = this.INF;

        const results = [];

        for (let i = 0; i < moves.length; i++) {

            if (this.outOfTime()) {
                this.stopped = true;
                break;
            }

            const move = moves[i];

            this.play(chess, move);

            let score;

            if (chess.in_checkmate()) {

                score = this.MATE;

            } else if (chess.in_draw()) {

                score = 0;

            } else if (i === 0) {

                score = -this.search(
                    chess,
                    depth - 1,
                    -beta,
                    -alpha,
                    1
                );

            } else {

                // Principal Variation Search.
                score = -this.search(
                    chess,
                    depth - 1,
                    -alpha - 1,
                    -alpha,
                    1
                );

                if (
                    score > alpha &&
                    score < beta
                ) {

                    score = -this.search(
                        chess,
                        depth - 1,
                        -beta,
                        -alpha,
                        1
                    );
                }
            }

            chess.undo();

            if (this.stopped) {
                break;
            }

            results.push({
                move,
                score
            });

            if (score > alpha) {
                alpha = score;
            }
        }

        results.sort(
            (a, b) => b.score - a.score
        );

        return results;
    },

    // =========================================================
    // NEGAMAX
    // =========================================================

    search(
        chess,
        depth,
        alpha,
        beta,
        ply
    ) {

        this.nodes++;

        if (
            (this.nodes & 2047) === 0 &&
            this.outOfTime()
        ) {
            this.stopped = true;
        }

        if (this.stopped) {
            return 0;
        }

        // Remises.
        if (ply > 0) {

            const draw =
                ply <= 3
                    ? chess.in_draw()
                    : chess.insufficient_material();

            if (draw) {
                return 0;
            }
        }

        const inCheck = chess.in_check();

        // Schaakextensie.
        if (
            inCheck &&
            ply < 30
        ) {
            depth++;
        }

        // Extra aandacht voor scherpe tactische stellingen.
        if (
            !inCheck &&
            depth <= 1 &&
            ply < 24 &&
            this.isTacticalPosition(chess)
        ) {
            depth++;
        }

        if (depth <= 0) {
            return this.quiescence(
                chess,
                alpha,
                beta,
                ply
            );
        }

        const moves =
            chess.moves({ verbose: true });

        if (!moves.length) {

            return inCheck
                ? -this.MATE + ply
                : 0;
        }

        const alphaOrig = alpha;

        const key = this.key(chess);
        const entry = this.table.get(key);

        let ttMove = null;

        if (entry) {

            ttMove = entry.move;

            if (
                entry.depth >= depth &&
                Math.abs(entry.score) <
                    this.MATE - 1000
            ) {

                if (
                    entry.flag === this.EXACT
                ) {
                    return entry.score;
                }

                if (
                    entry.flag === this.LOWER
                ) {

                    alpha = Math.max(
                        alpha,
                        entry.score
                    );

                } else if (
                    entry.flag === this.UPPER
                ) {

                    beta = Math.min(
                        beta,
                        entry.score
                    );
                }

                if (alpha >= beta) {
                    return entry.score;
                }
            }
        }

        this.orderMoves(
            moves,
            ply,
            ttMove
        );

        let best = -this.INF;
        let bestMove = null;

        for (
            let i = 0;
            i < moves.length;
            i++
        ) {

            const move = moves[i];

            const quiet =
                !move.captured &&
                !move.promotion;

            this.play(chess, move);

            let score;

            if (i === 0) {

                score = -this.search(
                    chess,
                    depth - 1,
                    -beta,
                    -alpha,
                    ply + 1
                );

            } else {

                let reduction = 0;

                /*
                 * Late Move Reduction.
                 *
                 * We zijn bewust voorzichtig:
                 * defensieve zetten mogen niet te snel
                 * worden weggefilterd.
                 */
                if (
                    depth >= 5 &&
                    i >= 6 &&
                    quiet &&
                    !inCheck &&
                    !chess.in_check()
                ) {
                    reduction = 1;
                }

                score = -this.search(
                    chess,
                    depth - 1 - reduction,
                    -alpha - 1,
                    -alpha,
                    ply + 1
                );

                if (
                    score > alpha &&
                    (
                        reduction > 0 ||
                        score < beta
                    )
                ) {

                    score = -this.search(
                        chess,
                        depth - 1,
                        -beta,
                        -alpha,
                        ply + 1
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

                    this.storeKiller(
                        move,
                        ply
                    );

                    this.updateHistory(
                        move,
                        depth
                    );
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

        this.table.set(
            key,
            {
                depth,
                score: best,
                flag,
                move:
                    bestMove
                        ? this.moveKey(bestMove)
                        : null
            }
        );

        return best;
    },

    // =========================================================
    // QUIESCENCE
    // =========================================================

    quiescence(
        chess,
        alpha,
        beta,
        ply
    ) {

        this.nodes++;

        if (
            (this.nodes & 2047) === 0 &&
            this.outOfTime()
        ) {
            this.stopped = true;
        }

        if (this.stopped) {
            return 0;
        }

        if (ply >= this.MAX_PLY) {
            return this.evaluate(chess);
        }

        const inCheck = chess.in_check();

        let moves =
            chess.moves({
                verbose: true
            });

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

            /*
             * Belangrijk:
             * niet alleen captures, maar ook schaakzetten.
             */
            moves = moves.filter(
                m =>
                    m.captured ||
                    m.promotion ||
                    this.isCheckingMove(
                        chess,
                        m
                    )
            );
        }

        this.orderMoves(
            moves,
            ply,
            null
        );

        let best =
            inCheck
                ? -this.INF
                : stand;

        for (const move of moves) {

            /*
             * Delta pruning.
             * Alleen gebruiken bij normale slagzetten.
             */
            if (
                !inCheck &&
                !move.promotion &&
                move.captured &&
                stand +
                    this.VALUES[
                        move.captured
                    ] +
                    200 <
                    alpha
            ) {
                continue;
            }

            this.play(chess, move);

            const score =
                -this.quiescence(
                    chess,
                    -beta,
                    -alpha,
                    ply + 1
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

    // =========================================================
    // EVALUATION
    // =========================================================

    evaluate(chess) {

        const board = chess.board();

        let score = 0;
        let npm = 0;

        const pawnRows = {
            w: Array.from(
                { length: 8 },
                () => []
            ),
            b: Array.from(
                { length: 8 },
                () => []
            )
        };

        const bishops = {
            w: 0,
            b: 0
        };

        const rooks = [];

        const kings = {};

        for (let r = 0; r < 8; r++) {

            for (let c = 0; c < 8; c++) {

                const p = board[r][c];

                if (!p) {
                    continue;
                }

                const sign =
                    p.color === "w"
                        ? 1
                        : -1;

                const idx =
                    p.color === "w"
                        ? r * 8 + c
                        : (7 - r) * 8 + c;

                if (p.type === "k") {

                    kings[p.color] = {
                        r,
                        c,
                        idx
                    };

                    continue;
                }

                score +=
                    sign *
                    (
                        this.VALUES[p.type] +
                        this.PST[p.type][idx]
                    );

                if (p.type === "p") {

                    pawnRows[
                        p.color
                    ][c].push(r);

                    continue;
                }

                npm += this.VALUES[p.type];

                if (p.type === "b") {
                    bishops[p.color]++;
                }

                if (p.type === "r") {

                    rooks.push({
                        color: p.color,
                        c
                    });
                }
            }
        }

        /*
         * Middenspel/eindspel-fase.
         */
        const mg =
            Math.min(
                1,
                npm / 6000
            );

        // =====================================================
        // KING SAFETY
        // =====================================================

        for (const color of ["w", "b"]) {

            const k = kings[color];

            if (!k) {
                continue;
            }

            const sign =
                color === "w"
                    ? 1
                    : -1;

            score +=
                sign *
                Math.round(
                    mg *
                        this.PST.k[k.idx] +
                    (1 - mg) *
                        this.PST.kEnd[k.idx]
                );

            if (mg > 0.4) {

                const dir =
                    color === "w"
                        ? -1
                        : 1;

                let shield = 0;

                for (
                    let dc = -1;
                    dc <= 1;
                    dc++
                ) {

                    const f =
                        k.c + dc;

                    if (
                        f < 0 ||
                        f > 7
                    ) {
                        continue;
                    }

                    for (
                        const step of [1, 2]
                    ) {

                        if (
                            pawnRows[color][f]
                                .includes(
                                    k.r +
                                    dir * step
                                )
                        ) {

                            shield++;
                            break;
                        }
                    }
                }

                score +=
                    sign *
                    Math.round(
                        shield *
                        (
                            10 * mg +
                            8 *
                            this.openingWeight *
                            this.DEFENSIVE_OPENING
                        )
                    );
            }
        }

        // =====================================================
        // PAWN STRUCTURE
        // =====================================================

        for (const color of ["w", "b"]) {

            const sign =
                color === "w"
                    ? 1
                    : -1;

            const enemy =
                color === "w"
                    ? "b"
                    : "w";

            const own =
                pawnRows[color];

            const opp =
                pawnRows[enemy];

            for (
                let f = 0;
                f < 8;
                f++
            ) {

                const n =
                    own[f].length;

                if (!n) {
                    continue;
                }

                // Doubled pawns.
                if (n > 1) {

                    score -=
                        sign *
                        12 *
                        (n - 1);
                }

                // Isolated pawns.
                const isolated =
                    (
                        f === 0 ||
                        own[f - 1].length === 0
                    ) &&
                    (
                        f === 7 ||
                        own[f + 1].length === 0
                    );

                if (isolated) {

                    score -=
                        sign *
                        15 *
                        n;
                }

                // Passed pawns.
                for (
                    const r of own[f]
                ) {

                    let passed = true;

                    for (
                        let df = -1;
                        df <= 1 &&
                        passed;
                        df++
                    ) {

                        const ff =
                            f + df;

                        if (
                            ff < 0 ||
                            ff > 7
                        ) {
                            continue;
                        }

                        for (
                            const er of
                            opp[ff]
                        ) {

                            if (
                                color === "w"
                                    ? er < r
                                    : er > r
                            ) {

                                passed = false;
                                break;
                            }
                        }
                    }

                    if (passed) {

                        const adv =
                            color === "w"
                                ? 6 - r
                                : r - 1;

                        score +=
                            sign *
                            (
                                this.PASSED[adv] ||
                                0
                            );
                    }
                }
            }
        }

        // =====================================================
        // ROOKS
        // =====================================================

        for (const rook of rooks) {

            const sign =
                rook.color === "w"
                    ? 1
                    : -1;

            const enemy =
                rook.color === "w"
                    ? "b"
                    : "w";

            const own =
                pawnRows[
                    rook.color
                ][rook.c].length;

            const opp =
                pawnRows[
                    enemy
                ][rook.c].length;

            if (!own && !opp) {

                score += sign * 18;

            } else if (!own) {

                score += sign * 10;
            }
        }

        // =====================================================
        // BISHOP PAIR
        // =====================================================

        if (bishops.w >= 2) {
            score += 30;
        }

        if (bishops.b >= 2) {
            score -= 30;
        }

        // =====================================================
        // DEFENSIVE OPENING
        // =====================================================

        if (
            this.openingWeight > 0 &&
            this.DEFENSIVE_OPENING > 0
        ) {

            score += Math.round(
                this.openingSolidity(
                    board,
                    kings
                ) *
                this.openingWeight *
                this.DEFENSIVE_OPENING
            );
        }

        // =====================================================
        // TACTICAL SAFETY
        // =====================================================

        score +=
            this.tacticalSafety(
                chess
            );

        // =====================================================
        // ATTACK POTENTIAL
        // =====================================================

        score +=
            this.kingAttack(
                chess
            );

        // Score vanuit speler aan zet.
        return (
            chess.turn() === "w"
                ? score
                : -score
        ) + 10;
    },

    // =========================================================
    // TACTICAL SAFETY
    // =========================================================

    tacticalSafety(chess) {

        const board = chess.board();

        let score = 0;

        for (let r = 0; r < 8; r++) {

            for (let c = 0; c < 8; c++) {

                const piece =
                    board[r][c];

                if (
                    !piece ||
                    piece.type === "k"
                ) {
                    continue;
                }

                const attackers =
                    this.countAttackers(
                        board,
                        r,
                        c,
                        piece.color === "w"
                            ? "b"
                            : "w"
                    );

                if (!attackers) {
                    continue;
                }

                const defenders =
                    this.countAttackers(
                        board,
                        r,
                        c,
                        piece.color
                    );

                const value =
                    this.VALUES[
                        piece.type
                    ];

                /*
                 * Volledig ongedekt zwaar stuk:
                 * zeer belangrijk voor Obsidian.
                 */
                if (!defenders) {

                    let penalty = 0;

                    if (piece.type === "q") {
                        penalty = 520;

                    } else if (
                        piece.type === "r"
                    ) {
                        penalty = 300;

                    } else if (
                        piece.type === "b" ||
                        piece.type === "n"
                    ) {
                        penalty = 135;

                    } else {
                        penalty = 55;
                    }

                    score +=
                        piece.color === "w"
                            ? -penalty
                            : penalty;

                    continue;
                }

                /*
                 * Belangrijk defensief principe:
                 *
                 * Als een goedkope vijand een duur stuk aanvalt,
                 * moet Obsidian dit serieus nemen.
                 *
                 * Voorbeeld:
                 * pion -> toren = gevaarlijk.
                 * dame -> toren terwijl dame zelf kan worden genomen
                 * is veel minder gevaarlijk; daarom wegen verdedigers mee.
                 */
                const cheapest =
                    this.cheapestAttackerValue(
                        board,
                        r,
                        c,
                        piece.color === "w"
                            ? "b"
                            : "w"
                    );

                if (
                    cheapest < value
                ) {

                    let danger =
                        Math.round(
                            (value - cheapest) *
                            0.22
                        );

                    /*
                     * Extra voorzichtig met dame/toren.
                     */
                    if (
                        piece.type === "q"
                    ) {
                        danger += 20;
                    }

                    if (
                        piece.type === "r"
                    ) {
                        danger += 10;
                    }

                    score +=
                        piece.color === "w"
                            ? -danger
                            : danger;
                }

                /*
                 * Twee of meer verdedigers maken
                 * zware stukken stabieler.
                 */
                if (
                    defenders >= 2 &&
                    value >= 500
                ) {

                    score +=
                        piece.color === "w"
                            ? 14
                            : -14;
                }
            }
        }

        return score;
    },

    cheapestAttackerValue(
        board,
        tr,
        tc,
        color
    ) {

        let best = this.INF;

        for (let r = 0; r < 8; r++) {

            for (let c = 0; c < 8; c++) {

                const p =
                    board[r][c];

                if (
                    !p ||
                    p.color !== color
                ) {
                    continue;
                }

                if (
                    this.pieceAttacksSquare(
                        board,
                        r,
                        c,
                        tr,
                        tc
                    )
                ) {

                    best = Math.min(
                        best,
                        this.VALUES[p.type]
                    );
                }
            }
        }

        return best;
    },

    countAttackers(
        board,
        tr,
        tc,
        color
    ) {

        let count = 0;

        for (let r = 0; r < 8; r++) {

            for (let c = 0; c < 8; c++) {

                const p =
                    board[r][c];

                if (
                    p &&
                    p.color === color &&
                    this.pieceAttacksSquare(
                        board,
                        r,
                        c,
                        tr,
                        tc
                    )
                ) {
                    count++;
                }
            }
        }

        return count;
    },

    pieceAttacksSquare(
        board,
        r,
        c,
        tr,
        tc
    ) {

        const p =
            board[r][c];

        if (!p) {
            return false;
        }

        const dr =
            tr - r;

        const dc =
            tc - c;

        const adr =
            Math.abs(dr);

        const adc =
            Math.abs(dc);

        // Pawn.
        if (p.type === "p") {

            const dir =
                p.color === "w"
                    ? -1
                    : 1;

            return (
                dr === dir &&
                adc === 1
            );
        }

        // Knight.
        if (p.type === "n") {

            return (
                (
                    adr === 2 &&
                    adc === 1
                ) ||
                (
                    adr === 1 &&
                    adc === 2
                )
            );
        }

        // King.
        if (p.type === "k") {

            return (
                adr <= 1 &&
                adc <= 1 &&
                (adr || adc)
            );
        }

        const diagonal =
            adr === adc &&
            adr > 0;

        const straight =
            (
                dr === 0 ||
                dc === 0
            ) &&
            (dr || dc);

        if (
            p.type === "b" &&
            !diagonal
        ) {
            return false;
        }

        if (
            p.type === "r" &&
            !straight
        ) {
            return false;
        }

        if (
            p.type === "q" &&
            !diagonal &&
            !straight
        ) {
            return false;
        }

        const stepR =
            dr === 0
                ? 0
                : dr > 0
                    ? 1
                    : -1;

        const stepC =
            dc === 0
                ? 0
                : dc > 0
                    ? 1
                    : -1;

        let rr =
            r + stepR;

        let cc =
            c + stepC;

        while (
            rr !== tr ||
            cc !== tc
        ) {

            if (
                board[rr][cc]
            ) {
                return false;
            }

            rr += stepR;
            cc += stepC;
        }

        return true;
    },

    // =========================================================
    // KING ATTACK
    // =========================================================

    kingAttack(chess) {

        const board =
            chess.board();

        const kings = {};

        for (let r = 0; r < 8; r++) {

            for (let c = 0; c < 8; c++) {

                const p =
                    board[r][c];

                if (
                    p &&
                    p.type === "k"
                ) {

                    kings[p.color] = {
                        r,
                        c
                    };
                }
            }
        }

        let score = 0;

        for (
            const color of ["w", "b"]
        ) {

            const enemy =
                color === "w"
                    ? "b"
                    : "w";

            const king =
                kings[enemy];

            if (!king) {
                continue;
            }

            let attackers = 0;
            let heavy = 0;

            for (let r = 0; r < 8; r++) {

                for (let c = 0; c < 8; c++) {

                    const p =
                        board[r][c];

                    if (
                        !p ||
                        p.color !== color ||
                        p.type === "k"
                    ) {
                        continue;
                    }

                    if (
                        this.pieceAttacksSquare(
                            board,
                            r,
                            c,
                            king.r,
                            king.c
                        )
                    ) {

                        attackers++;

                        if (
                            p.type === "q" ||
                            p.type === "r" ||
                            p.type === "b"
                        ) {
                            heavy++;
                        }
                    }
                }
            }

            /*
             * Eén aanval is meestal geen echte aanval.
             * Meerdere stukken rond de koning wel.
             */
            if (
                attackers >= 2
            ) {

                const pressure =
                    Math.min(
                        60,
                        attackers * 12 +
                        heavy * 9
                    );

                score +=
                    color === "w"
                        ? pressure
                        : -pressure;
            }

            /*
             * Koning in het centrum is kwetsbaarder.
             */
            if (
                king.r >= 2 &&
                king.r <= 5 &&
                attackers >= 1
            ) {

                score +=
                    color === "w"
                        ? 18
                        : -18;
            }
        }

        return score;
    },

    // =========================================================
    // OPENING EVALUATION
    // =========================================================

    openingSolidity(
        board,
        kings
    ) {

        let total = 0;

        for (
            const color of ["w", "b"]
        ) {

            const sign =
                color === "w"
                    ? 1
                    : -1;

            const homeRow =
                color === "w"
                    ? 7
                    : 0;

            let s = 0;

            const k =
                kings[color];

            if (k) {

                /*
                 * Geroceerde/veilige koning.
                 */
                if (
                    k.r === homeRow &&
                    (
                        k.c === 6 ||
                        k.c === 2 ||
                        k.c === 7 ||
                        k.c === 1
                    )
                ) {

                    s += 45;

                } else if (
                    k.r === homeRow &&
                    k.c === 4
                ) {

                    s -= 15;

                } else {

                    s -= 40;
                }
            }

            let undevelopedKnights = 0;
            let undevelopedBishops = 0;

            for (
                const c of [1, 2, 5, 6]
            ) {

                const p =
                    board[homeRow][c];

                if (
                    p &&
                    p.color === color
                ) {

                    if (
                        p.type === "n"
                    ) {
                        undevelopedKnights++;
                    }

                    if (
                        p.type === "b"
                    ) {
                        undevelopedBishops++;
                    }
                }
            }

            s -=
                undevelopedKnights * 12 +
                undevelopedBishops * 24;

            let queenAway = false;

            for (let r = 0; r < 8; r++) {

                for (let c = 0; c < 8; c++) {

                    const p =
                        board[r][c];

                    if (
                        !p ||
                        p.color !== color
                    ) {
                        continue;
                    }

                    if (
                        p.type === "q" &&
                        !(
                            r === homeRow &&
                            c === 3
                        )
                    ) {

                        queenAway = true;
                    }

                    /*
                     * Loperontwikkeling.
                     */
                    if (
                        p.type === "b"
                    ) {

                        let mobility = 0;

                        const dirs = [
                            [-1, -1],
                            [-1, 1],
                            [1, -1],
                            [1, 1]
                        ];

                        for (
                            const [dr, dc]
                            of dirs
                        ) {

                            let rr = r + dr;
                            let cc = c + dc;

                            while (
                                rr >= 0 &&
                                rr < 8 &&
                                cc >= 0 &&
                                cc < 8
                            ) {

                                const t =
                                    board[rr][cc];

                                if (!t) {

                                    mobility++;

                                } else {

                                    if (
                                        t.color !== color
                                    ) {
                                        mobility++;
                                    }

                                    break;
                                }

                                rr += dr;
                                cc += dc;
                            }
                        }

                        s +=
                            Math.min(
                                mobility,
                                9
                            ) * 4;
                    }

                    if (
                        p.type !== "p"
                    ) {
                        continue;
                    }

                    /*
                     * Geen onnodige flankpionstorm
                     * in de opening.
                     */
                    const adv =
                        color === "w"
                            ? 6 - r
                            : r - 1;

                    if (
                        (
                            c <= 1 ||
                            c >= 5
                        ) &&
                        adv >= 2
                    ) {

                        s -= 10;
                    }
                }
            }

            /*
             * Dame te vroeg naar voren.
             */
            if (
                queenAway &&
                (
                    undevelopedKnights +
                    undevelopedBishops
                ) > 0
            ) {

                s -=
                    (
                        undevelopedKnights +
                        undevelopedBishops
                    ) * 10;
            }

            total +=
                sign * s;
        }

        return total;
    },

    // =========================================================
    // MOVE ORDERING
    // =========================================================

    orderMoves(
        moves,
        ply,
        ttKey
    ) {

        const scored =
            moves.map(
                move => ({
                    move,
                    score:
                        this.moveScore(
                            move,
                            ply,
                            ttKey
                        )
                })
            );

        scored.sort(
            (a, b) =>
                b.score - a.score
        );

        for (
            let i = 0;
            i < moves.length;
            i++
        ) {

            moves[i] =
                scored[i].move;
        }
    },

    moveScore(
        move,
        ply,
        ttKey
    ) {

        const key =
            this.moveKey(move);

        /*
         * TT move altijd eerst.
         */
        if (
            ttKey &&
            key === ttKey
        ) {
            return 10000000;
        }

        let score = 0;

        /*
         * Captures:
         * Most Valuable Victim /
         * Least Valuable Attacker.
         */
        if (
            move.captured
        ) {

            score +=
                100000 +
                this.VALUES[
                    move.captured
                ] * 12 -
                this.VALUES[
                    move.piece
                ];

        } else {

            const killers =
                this.killerMoves[ply];

            if (killers) {

                if (
                    killers[0] === key
                ) {
                    score += 90000;

                } else if (
                    killers[1] === key
                ) {
                    score += 80000;
                }
            }

            score +=
                this.history.get(key) || 0;

            /*
             * In de opening ontwikkelen.
             */
            if (
                this.openingWeight > 0 &&
                move.piece === "b" &&
                (
                    move.from === "c1" ||
                    move.from === "f1" ||
                    move.from === "c8" ||
                    move.from === "f8"
                )
            ) {

                score += 5000;
            }
        }

        /*
         * Promotie.
         */
        if (
            move.promotion
        ) {

            score +=
                95000 +
                this.VALUES[
                    move.promotion
                ];
        }

        return score;
    },

    // =========================================================
    // KILLER / HISTORY
    // =========================================================

    storeKiller(
        move,
        ply
    ) {

        const key =
            this.moveKey(move);

        if (
            !this.killerMoves[ply]
        ) {

            this.killerMoves[ply] = [];
        }

        const list =
            this.killerMoves[ply];

        if (
            !list.includes(key)
        ) {

            list.unshift(key);
        }

        if (
            list.length > 2
        ) {

            list.pop();
        }
    },

    updateHistory(
        move,
        depth
    ) {

        const key =
            this.moveKey(move);

        const old =
            this.history.get(key) || 0;

        this.history.set(
            key,
            Math.min(
                old +
                depth * depth,
                10000
            )
        );
    },

    // =========================================================
    // TACTICAL HELPERS
    // =========================================================

    isCheckingMove(
        chess,
        move
    ) {

        this.play(
            chess,
            move
        );

        const result =
            chess.in_check();

        chess.undo();

        return result;
    },

    isTacticalPosition(
        chess
    ) {

        const moves =
            chess.moves({
                verbose: true
            });

        let captures = 0;
        let checks = 0;
        let promotions = 0;

        for (
            const move of moves
        ) {

            if (
                move.captured
            ) {
                captures++;
            }

            if (
                move.promotion
            ) {
                promotions++;
            }

            if (
                !move.captured &&
                !move.promotion &&
                this.isCheckingMove(
                    chess,
                    move
                )
            ) {

                checks++;
            }
        }

        return (
            promotions > 0 ||
            captures >= 2 ||
            checks > 0
        );
    },

    // =========================================================
    // HELPERS
    // =========================================================

    play(
        chess,
        move
    ) {

        chess.move({
            from: move.from,
            to: move.to,
            promotion:
                move.promotion || "q"
        });
    },

    key(chess) {

        /*
         * Zetteller weglaten:
         * dezelfde positie = dezelfde TT-entry.
         */
        return chess
            .fen()
            .split(" ")
            .slice(0, 4)
            .join(" ");
    },

    moveKey(move) {

        return (
            move.from +
            move.to +
            (
                move.promotion || ""
            )
        );
    },

    outOfTime() {

        return (
            performance.now() -
            this.startTime >=
            this.MAX_SEARCH_TIME
        );
    }
};
