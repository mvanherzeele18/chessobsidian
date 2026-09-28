const Obsidian = {

    SEARCH_DEPTH: 5,

    // Maximale denktijd per zet.
    MAX_SEARCH_TIME: 1800,

    VALUES: {
        p: 100,
        n: 320,
        b: 330,
        r: 500,
        q: 900,
        k: 20000
    },

    // ---------------------------------------------------------
    // STATE
    // ---------------------------------------------------------

    table: new Map(),
    killerMoves: [],
    history: new Map(),

    startTime: 0,
    stopped: false,
    nodes: 0,

    // ---------------------------------------------------------
    // PIECE SQUARE TABLES
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

        this.killerMoves = [];
        this.history.clear();

        // Geen oneindig grote transposition table.
        if (this.table.size > 100000) {
            this.table.clear();
        }

        const rootColor = chess.turn();
        const rootMoves = chess.moves({
            verbose: true
        });

        if (!rootMoves.length) {
            return [];
        }

        this.orderMoves(
            chess,
            rootMoves,
            0
        );

        let bestResults = [];

        // Iterative deepening.
        // Als depth 5 niet binnen de tijd lukt,
        // houden we de volledige depth 4-resultaten.
        for (
            let depth = 1;
            depth <= this.SEARCH_DEPTH;
            depth++
        ) {

            const results =
                this.searchRoot(
                    chess,
                    depth,
                    rootColor,
                    rootMoves
                );

            if (this.stopped) {
                break;
            }

            if (results.length) {
                bestResults = results;
            }
        }

        bestResults.sort(
            (a, b) => b.score - a.score
        );

        return bestResults.slice(0, amount);
    },

    // ---------------------------------------------------------
    // ROOT SEARCH
    // ---------------------------------------------------------

    searchRoot(
        chess,
        depth,
        rootColor,
        moves
    ) {

        let alpha = -Infinity;
        const beta = Infinity;

        const results = [];

        this.orderMoves(
            chess,
            moves,
            0
        );

        for (const move of moves) {

            if (this.outOfTime()) {
                this.stopped = true;
                break;
            }

            chess.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || "q"
            });

            let score;

            if (chess.in_checkmate()) {
                score = 1000000;
            } else if (
                chess.in_draw() ||
                chess.in_stalemate()
            ) {
                score = 0;
            } else {

                score = this.search(
                    chess,
                    depth - 1,
                    -beta,
                    -alpha,
                    rootColor,
                    1
                );

                score = -score;
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

        // Gebruik de nieuwe volgorde voor de volgende
        // iterative-deepening laag.
        moves.splice(
            0,
            moves.length,
            ...results.map(x => x.move)
        );

        return results;
    },

    // ---------------------------------------------------------
    // NEGAMAX + ALPHA BETA
    // ---------------------------------------------------------

    search(
        chess,
        depth,
        alpha,
        beta,
        rootColor,
        ply
    ) {

        this.nodes++;

        // Niet iedere node performance.now() doen:
        // dat is zelf ook verrassend duur.
        if ((this.nodes & 2047) === 0) {

            if (this.outOfTime()) {
                this.stopped = true;
                return 0;
            }
        }

        const key = chess.fen();

        const cached = this.table.get(key);

        if (
            cached &&
            cached.depth >= depth
        ) {
            return cached.score;
        }

        if (chess.in_checkmate()) {
            return -1000000 + ply;
        }

        if (
            chess.in_draw() ||
            chess.in_stalemate() ||
            chess.insufficient_material()
        ) {
            return 0;
        }

        // Quiescence voorkomt dat Obsidian een positie
        // verkeerd beoordeelt midden in een ruil.
        if (depth <= 0) {
            return this.quiescence(
                chess,
                alpha,
                beta,
                rootColor,
                ply
            );
        }

        const moves = chess.moves({
            verbose: true
        });

        if (!moves.length) {
            return this.evaluate(
                chess,
                rootColor
            );
        }

        this.orderMoves(
            chess,
            moves,
            ply
        );

        let best = -Infinity;

        for (const move of moves) {

            chess.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || "q"
            });

            const score = -this.search(
                chess,
                depth - 1,
                -beta,
                -alpha,
                rootColor,
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

                this.storeKiller(
                    move,
                    ply
                );

                this.updateHistory(
                    move,
                    depth
                );

                break;
            }
        }

        this.table.set(key, {
            depth,
            score: best
        });

        return best;
    },

    // ---------------------------------------------------------
    // QUIESCENCE
    // ---------------------------------------------------------

    quiescence(
        chess,
        alpha,
        beta,
        rootColor,
        ply
    ) {

        this.nodes++;

        if ((this.nodes & 4095) === 0) {

            if (this.outOfTime()) {
                this.stopped = true;
                return 0;
            }
        }

        if (chess.in_checkmate()) {
            return -1000000 + ply;
        }

        const standPat =
            this.evaluate(
                chess,
                rootColor
            );

        if (standPat >= beta) {
            return beta;
        }

        if (standPat > alpha) {
            alpha = standPat;
        }

        let moves = chess.moves({
            verbose: true
        });

        // Alleen tactische zetten.
        moves = moves.filter(move =>
            move.captured ||
            move.promotion ||
            this.givesCheck(chess, move)
        );

        this.orderMoves(
            chess,
            moves,
            ply
        );

        for (const move of moves) {

            chess.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || "q"
            });

            const score = -this.quiescence(
                chess,
                -beta,
                -alpha,
                rootColor,
                ply + 1
            );

            chess.undo();

            if (this.stopped) {
                return 0;
            }

            if (score >= beta) {
                return beta;
            }

            if (score > alpha) {
                alpha = score;
            }
        }

        return alpha;
    },

    // ---------------------------------------------------------
    // EVALUATION
    // ---------------------------------------------------------

    evaluate(chess, botColor) {

        const enemy =
            botColor === "w"
                ? "b"
                : "w";

        let score = 0;

        score += this.material(chess, botColor);

        score += this.position(
            chess,
            botColor
        );

        score += this.development(
            chess,
            botColor
        );

        score += this.center(
            chess,
            botColor
        );

        score += this.kingSafety(
            chess,
            botColor
        );

        score += this.pieceSafety(
            chess,
            botColor
        );

        score += this.activity(
            chess,
            botColor
        );

        score += this.pawns(
            chess,
            botColor
        );

        return score;
    },

    // ---------------------------------------------------------
    // MATERIAL
    // ---------------------------------------------------------

    material(chess, color) {

        let score = 0;

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const piece =
                    chess.get(
                        this.square(row, col)
                    );

                if (!piece) {
                    continue;
                }

                const value =
                    this.VALUES[piece.type];

                score +=
                    piece.color === color
                        ? value
                        : -value;
            }
        }

        return score;
    },

    // ---------------------------------------------------------
    // POSITION
    // ---------------------------------------------------------

    position(chess, color) {

        let score = 0;

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const piece =
                    chess.get(
                        this.square(row, col)
                    );

                if (!piece) {
                    continue;
                }

                let index =
                    row * 8 + col;

                // PST is from White's perspective.
                if (piece.color === "b") {
                    index =
                        (7 - row) * 8 + col;
                }

                const value =
                    this.PST[piece.type][index] || 0;

                score +=
                    piece.color === color
                        ? value
                        : -value;
            }
        }

        return score;
    },

    // ---------------------------------------------------------
    // DEVELOPMENT
    // ---------------------------------------------------------

    development(chess, color) {

        let score = 0;

        const enemy =
            color === "w"
                ? "b"
                : "w";

        score +=
            this.developmentColor(
                chess,
                color
            );

        score -=
            this.developmentColor(
                chess,
                enemy
            );

        return score;
    },

    developmentColor(chess, color) {

        let score = 0;

        const rank =
            color === "w"
                ? "1"
                : "8";

        const starting = [
            `b${rank}`,
            `g${rank}`,
            `c${rank}`,
            `f${rank}`
        ];

        for (const square of starting) {

            const piece =
                chess.get(square);

            if (
                piece &&
                piece.color === color &&
                (
                    piece.type === "n" ||
                    piece.type === "b"
                )
            ) {
                score -= 30;
            }
        }

        // Ontwikkelde minor pieces.
        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const square =
                    this.square(row, col);

                const piece =
                    chess.get(square);

                if (
                    !piece ||
                    piece.color !== color
                ) {
                    continue;
                }

                if (
                    piece.type === "n" ||
                    piece.type === "b"
                ) {

                    if (
                        row >= 2 &&
                        row <= 5
                    ) {
                        score += 12;
                    }
                }
            }
        }

        return score;
    },

    // ---------------------------------------------------------
    // CENTER
    // ---------------------------------------------------------

    center(chess, color) {

        const enemy =
            color === "w"
                ? "b"
                : "w";

        let score = 0;

        const mainCenter = [
            "d4",
            "e4",
            "d5",
            "e5"
        ];

        const extended = [
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

        for (const square of mainCenter) {

            const piece =
                chess.get(square);

            if (!piece) {
                continue;
            }

            const bonus =
                piece.type === "p"
                    ? 42
                    : 25;

            score +=
                piece.color === color
                    ? bonus
                    : -bonus;
        }

        for (const square of extended) {

            const piece =
                chess.get(square);

            if (!piece) {
                continue;
            }

            score +=
                piece.color === color
                    ? 7
                    : -7;
        }

        return score;
    },

    // ---------------------------------------------------------
    // KING SAFETY
    // ---------------------------------------------------------

    kingSafety(chess, color) {

        const enemy =
            color === "w"
                ? "b"
                : "w";

        let score = 0;

        const ownKing =
            this.findKing(
                chess,
                color
            );

        if (!ownKing) {
            return -1000;
        }

        const enemyMap =
            this.fastAttackMap(
                chess,
                enemy
            );

        if (
            enemyMap.has(ownKing)
        ) {
            score -= 180;
        } else {
            score += 25;
        }

        // Rokeren.
        const history =
            chess.history();

        if (
            history.includes("O-O") ||
            history.includes("O-O-O")
        ) {
            score += 60;
        }

        return score;
    },

    // ---------------------------------------------------------
    // PIECE SAFETY
    //
    // Snelle versie van de tactische
    // aanvaller/verdediger-evaluatie.
    // ---------------------------------------------------------

    pieceSafety(chess, color) {

        const enemy =
            color === "w"
                ? "b"
                : "w";

        const ownMap =
            this.fastAttackMap(
                chess,
                color
            );

        const enemyMap =
            this.fastAttackMap(
                chess,
                enemy
            );

        let score = 0;

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const square =
                    this.square(row, col);

                const piece =
                    chess.get(square);

                if (
                    !piece ||
                    piece.color !== color
                ) {
                    continue;
                }

                const attackers =
                    enemyMap.get(square) || [];

                const defenders =
                    ownMap.get(square) || [];

                if (!attackers.length) {
                    continue;
                }

                const targetValue =
                    this.VALUES[piece.type];

                // Helemaal ongedekt.
                if (!defenders.length) {

                    if (targetValue >= 900) {
                        score -= 300;
                    } else if (targetValue >= 500) {
                        score -= 190;
                    } else if (targetValue >= 320) {
                        score -= 110;
                    } else {
                        score -= 55;
                    }

                    continue;
                }

                // Er is een verdediger.
                //
                // Belangrijk:
                // we kijken naar de goedkoopste aanvaller.
                //
                // Pion -> toren = gevaarlijk.
                // Dame -> toren = potentieel goede ruil.
                const attacker =
                    this.cheapestAttacker(
                        attackers
                    );

                const attackerValue =
                    this.VALUES[
                        attacker.type
                    ];

                if (
                    attackerValue <
                    targetValue
                ) {

                    // Een goedkope aanvaller
                    // valt een duur stuk aan.
                    score -= Math.round(
                        (
                            targetValue -
                            attackerValue
                        ) * 0.32
                    );

                } else if (
                    attackerValue >
                    targetValue
                ) {

                    // Duur stuk valt ons aan.
                    // Als verdediger aanwezig:
                    // waarschijnlijk gunstige ruil.
                    score += Math.round(
                        (
                            attackerValue -
                            targetValue
                        ) * 0.22
                    );
                }
            }
        }

        return score;
    },

    cheapestAttacker(list) {

        let best = list[0];

        for (let i = 1; i < list.length; i++) {

            if (
                this.VALUES[list[i].type] <
                this.VALUES[best.type]
            ) {
                best = list[i];
            }
        }

        return best;
    },

    // ---------------------------------------------------------
    // ACTIVITY
    // ---------------------------------------------------------

    activity(chess, color) {

        const enemy =
            color === "w"
                ? "b"
                : "w";

        const ownMoves =
            chess.turn() === color
                ? chess.moves({ verbose: true }).length
                : 0;

        let score =
            ownMoves * 2;

        // Aanval op centrum / vijandelijke stukken.
        const map =
            this.fastAttackMap(
                chess,
                color
            );

        for (const [square, attackers] of map) {

            const target =
                chess.get(square);

            if (
                target &&
                target.color === enemy
            ) {
                score +=
                    Math.min(
                        attackers.length * 5,
                        20
                    );
            }
        }

        return score;
    },

    // ---------------------------------------------------------
    // PAWNS
    // ---------------------------------------------------------

    pawns(chess, color) {

        let score = 0;

        const enemy =
            color === "w"
                ? "b"
                : "w";

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const piece =
                    chess.get(
                        this.square(row, col)
                    );

                if (
                    !piece ||
                    piece.type !== "p"
                ) {
                    continue;
                }

                let value = 0;

                if (
                    this.square(row, col) === "d4" ||
                    this.square(row, col) === "e4" ||
                    this.square(row, col) === "d5" ||
                    this.square(row, col) === "e5"
                ) {
                    value += 20;
                }

                score +=
                    piece.color === color
                        ? value
                        : -value;
            }
        }

        return score;
    },

    // ---------------------------------------------------------
    // FAST ATTACK MAP
    //
    // Dit is een van de grootste snelheidswinsten.
    //
    // We maken GEEN nieuwe Chess-objecten.
    // We gebruiken alleen de geometrie van stukken.
    // ---------------------------------------------------------

    fastAttackMap(chess, color) {

        const map = new Map();

        const add = (
            square,
            piece
        ) => {

            if (!map.has(square)) {
                map.set(square, []);
            }

            map.get(square).push({
                type: piece.type
            });
        };

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const piece =
                    chess.get(
                        this.square(row, col)
                    );

                if (
                    !piece ||
                    piece.color !== color
                ) {
                    continue;
                }

                const from =
                    this.square(row, col);

                // PAWN
                if (piece.type === "p") {

                    const dir =
                        color === "w"
                            ? -1
                            : 1;

                    const attackRow =
                        row + dir;

                    if (
                        attackRow >= 0 &&
                        attackRow <= 7
                    ) {

                        for (
                            const dc of [-1, 1]
                        ) {

                            const c =
                                col + dc;

                            if (
                                c >= 0 &&
                                c < 8
                            ) {
                                add(
                                    this.square(
                                        attackRow,
                                        c
                                    ),
                                    piece
                                );
                            }
                        }
                    }

                    continue;
                }

                // KNIGHT
                if (piece.type === "n") {

                    const jumps = [
                        [-2,-1],
                        [-2, 1],
                        [-1,-2],
                        [-1, 2],
                        [ 1,-2],
                        [ 1, 2],
                        [ 2,-1],
                        [ 2, 1]
                    ];

                    for (const [dr, dc] of jumps) {

                        const r = row + dr;
                        const c = col + dc;

                        if (
                            r >= 0 &&
                            r < 8 &&
                            c >= 0 &&
                            c < 8
                        ) {
                            add(
                                this.square(r, c),
                                piece
                            );
                        }
                    }

                    continue;
                }

                // KING
                if (piece.type === "k") {

                    for (
                        let dr = -1;
                        dr <= 1;
                        dr++
                    ) {

                        for (
                            let dc = -1;
                            dc <= 1;
                            dc++
                        ) {

                            if (
                                dr === 0 &&
                                dc === 0
                            ) {
                                continue;
                            }

                            const r =
                                row + dr;

                            const c =
                                col + dc;

                            if (
                                r >= 0 &&
                                r < 8 &&
                                c >= 0 &&
                                c < 8
                            ) {
                                add(
                                    this.square(r, c),
                                    piece
                                );
                            }
                        }
                    }

                    continue;
                }

                // SLIDERS
                let directions = [];

                if (
                    piece.type === "b" ||
                    piece.type === "q"
                ) {
                    directions.push(
                        [-1,-1],
                        [-1, 1],
                        [ 1,-1],
                        [ 1, 1]
                    );
                }

                if (
                    piece.type === "r" ||
                    piece.type === "q"
                ) {
                    directions.push(
                        [-1, 0],
                        [ 1, 0],
                        [ 0,-1],
                        [ 0, 1]
                    );
                }

                for (const [dr, dc] of directions) {

                    let r = row + dr;
                    let c = col + dc;

                    while (
                        r >= 0 &&
                        r < 8 &&
                        c >= 0 &&
                        c < 8
                    ) {

                        const target =
                            chess.get(
                                this.square(r, c)
                            );

                        add(
                            this.square(r, c),
                            piece
                        );

                        // Een sliding piece kan niet
                        // door een ander stuk heen.
                        if (target) {
                            break;
                        }

                        r += dr;
                        c += dc;
                    }
                }
            }
        }

        return map;
    },

    // ---------------------------------------------------------
    // MOVE ORDERING
    // ---------------------------------------------------------

    orderMoves(chess, moves, ply) {

        moves.sort((a, b) => {

            return (
                this.moveScore(
                    chess,
                    b,
                    ply
                ) -
                this.moveScore(
                    chess,
                    a,
                    ply
                )
            );
        });
    },

    moveScore(chess, move, ply) {

        let score = 0;

        // Killer.
        const killers =
            this.killerMoves[ply];

        if (
            killers &&
            killers.includes(
                this.moveKey(move)
            )
        ) {
            score += 5000;
        }

        // History.
        score +=
            this.history.get(
                this.moveKey(move)
            ) || 0;

        // Capture.
        if (move.captured) {

            score +=
                this.VALUES[
                    move.captured
                ] * 12;

            score -=
                this.VALUES[
                    move.piece
                ];
        }

        // Promotion.
        if (move.promotion) {
            score += 10000;
        }

        // Checks.
        if (
            this.givesCheck(
                chess,
                move
            )
        ) {
            score += 3000;
        }

        // Centrum.
        if (
            move.to === "d4" ||
            move.to === "e4" ||
            move.to === "d5" ||
            move.to === "e5"
        ) {
            score += 150;
        }

        // Development.
        if (
            (
                move.piece === "n" ||
                move.piece === "b"
            ) &&
            this.isDevelopment(move)
        ) {
            score += 100;
        }

        return score;
    },

    isDevelopment(move) {

        return [
            "b1",
            "g1",
            "c1",
            "f1",
            "b8",
            "g8",
            "c8",
            "f8"
        ].includes(move.from);
    },

    givesCheck(chess, move) {

        chess.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || "q"
        });

        const result =
            chess.in_check();

        chess.undo();

        return result;
    },

    // ---------------------------------------------------------
    // KILLER / HISTORY
    // ---------------------------------------------------------

    storeKiller(move, ply) {

        const key =
            this.moveKey(move);

        if (!this.killerMoves[ply]) {
            this.killerMoves[ply] = [];
        }

        const list =
            this.killerMoves[ply];

        if (!list.includes(key)) {
            list.unshift(key);
        }

        if (list.length > 2) {
            list.pop();
        }
    },

    updateHistory(move, depth) {

        const key =
            this.moveKey(move);

        const old =
            this.history.get(key) || 0;

        this.history.set(
            key,
            Math.min(
                old + depth * depth,
                10000
            )
        );
    },

    // ---------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------

    findKing(chess, color) {

        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const square =
                    this.square(row, col);

                const piece =
                    chess.get(square);

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

    square(row, col) {

        return (
            "abcdefgh"[col] +
            (8 - row)
        );
    },

    moveKey(move) {

        return (
            move.from +
            move.to +
            (move.promotion || "")
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
