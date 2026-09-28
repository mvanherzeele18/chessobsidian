const Obsidian = {

    // Maximale diepte. De zoektijd bepaalt in de praktijk hoe diep hij komt.
    SEARCH_DEPTH: 15,

    // Maximale denktijd per zet (ms).
    MAX_SEARCH_TIME: 1000,

    // Verdedigende opening: 0 = uit, 1 = normaal, 2 = extra voorzichtig.
    DEFENSIVE_OPENING: 1,

    // Na hoeveel zetten de opening-bonussen volledig zijn uitgedoofd.
    OPENING_MOVES: 12,

    // Aanvalsdrang. Gevaar voor de eigen koning telt zwaarder dan
    // kansen op de vijandelijke koning (voorzichtig), maar bij een
    // echte aanval (veel stukken op zijn koning) wordt de bonus groot
    // genoeg om er vol voor te gaan.
    ATTACK_SCALE: 1.0,
    DEFENSE_SCALE: 1.25,
    DANGER_CAP: 500,

    // Openingsboek met solide hoofdlijnen.
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
    openingWeight: 1,
    fast: false,
    blockers: new Uint8Array(64),
    botColor: "w",
    nullDepth: 0,
    timeLimit: 2800,

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

    // Snelle evaluatie van één kandidaatzet (geen zoekopdracht), voor
    // situaties waarin de motor niet echt zoekt: boekzetten en de
    // enige-legale-zet-situatie. Vanuit het perspectief van de speler
    // die de zet speelt.
    quickEval(chess, move) {

        this.play(chess, move);

        const score = -this.evaluate(chess);

        this.undo(chess);

        return score;
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
        this.timeLimit = this.MAX_SEARCH_TIME;
        this.stopped = false;
        this.nodes = 0;
        this.nullDepth = 0;
        this.lastDepth = 0;

        this.killerMoves = [];
        this.history.clear();

        if (this.table.size > 300000) {
            this.table.clear();
        }

        amount = Math.max(1, amount);

        // Wie is de bot? (voor voorzichtig verdedigen / gretig aanvallen)
        this.botColor = chess.turn();

        // Openingsboek: solide hoofdlijnen, geen zoektijd nodig.
        if (this.USE_BOOK) {

            const book = this.bookMoves(chess);

            if (book) {
                return book;
            }
        }

        // Hoe "vroeg" is het spel? 1 = zet 1, 0 = opening voorbij.
        const fullmove = parseInt(chess.fen().split(" ")[5], 10) || 1;

        this.openingWeight = Math.max(
            0,
            1 - (fullmove - 1) / this.OPENING_MOVES
        );

        // De evaluatie verandert per zet in de opening, dus oude
        // tabelscores zijn niet meer geldig.
        if (this.openingWeight > 0) {
            this.table.clear();
        }

        const rootMoves = this.genMoves(chess);

        if (!rootMoves.length) {
            return [];
        }

        // Maar één legale zet: niet nadenken, wel de score tonen.
        if (rootMoves.length === 1) {
            return [{
                move: rootMoves[0],
                score: this.quickEval(chess, rootMoves[0])
            }];
        }

        // Veilige fallback: er is altijd minstens één zet.
        this.orderMoves(rootMoves, 0, null);

        let best = rootMoves.map(move => ({ move, score: 0 }));

        let prevKey = null;
        let prevScore = null;
        let lastIterMs = 0;
        let extended = false;

        for (let depth = 1; depth <= this.SEARCH_DEPTH; depth++) {

            // Bij meerdere lijnen wordt een half afgemaakte laag weggegooid:
            // begin er dan niet aan als hij waarschijnlijk niet af komt.
            const elapsed = performance.now() - this.startTime;

            if (
                amount > 1 &&
                depth > 3 &&
                elapsed + lastIterMs * 2.2 > this.timeLimit
            ) {
                break;
            }

            const iterStart = performance.now();

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

            lastIterMs = performance.now() - iterStart;

            // Onrustige stelling (andere beste zet of score zakt):
            // denk eenmalig 50% langer.
            const topKey = this.moveKey(results[0].move);

            if (
                !extended &&
                depth >= 4 &&
                prevKey !== null &&
                (topKey !== prevKey || results[0].score < prevScore - 40)
            ) {
                extended = true;
                this.timeLimit = this.MAX_SEARCH_TIME * 1.5;
            }

            prevKey = topKey;
            prevScore = results[0].score;

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
    // OPENINGSBOEK (solide hoofdlijnen, in SAN)
    // ---------------------------------------------------------

    bookTree: null,

    BOOK_LINES: [
        // 1.e4 e5
        "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7",
        "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8 Kxd8",
        "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7",
        "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Bc5 c3 d6 O-O O-O Re1 a6 Bb3 Ba7",
        "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6",
        "e4 e5 Nc3 Nf6 Nf3 Nc6 Bb5 Bb4 O-O O-O d3 d6 Bg5 Bxc3 bxc3 Qe7",
        "e4 e5 Bc4 Nf6 d3 c6 Nf3 d5 Bb3 Bd6 O-O O-O Nbd2",
        // Siciliaans
        "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7",
        "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 d6 Bg5 e6 Qd2 a6 O-O-O Bd7 f4 Be7",
        "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 Nb6 Bb3 dxe5 Nxe5 Nxe5 dxe5 Qxd1 Kxd1",
        // Frans
        "e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5 Qd2 Nc6 O-O-O a6",
        "e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2 cxd4 cxd4 f6 exf6 Nxf6 Nf3 Bd6 O-O O-O",
        // Caro-Kann
        "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6 Bf4 Qa5 c3 Ngf6",
        // Scandinavisch, Pirc, Moderne
        "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 c6 Nf3 Nf6 Bc4 Bf5 Bd2 e6 Qe2 Bb4",
        "e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O Bg4 Be3 Nc6 Qd2 e5 d5 Nb4",
        "e4 g6 d4 Bg7 Nc3 d6 Nf3 Nf6 Be2 O-O O-O c6 a4 Nbd7",
        // Damegambiet geweigerd, Slavisch
        "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 exd5 Bd3 Bb7 O-O Nbd7",
        "d4 d5 c4 e6 Nc3 Nf6 Nf3 Be7 Bg5 h6 Bh4 O-O e3 Ne4 Bxe7 Qxe7 Rc1 c6 Be2 Nxc3 Rxc3 dxc4 Bxc4 Nd7",
        "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O Nbd7 Qe2 Bg6",
        // Nimzo / Konings-Indisch / Engels
        "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7",
        "d4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7 O-O O-O Nc3 Ne4 Qc2 Nxc3 Qxc3 c5",
        "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7",
        // Londen
        "d4 d5 Nf3 Nf6 Bf4 e6 e3 Bd6 Bg3 O-O Nbd2 c5 c3 Nc6 Bd3 Qe7",
        "d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3 Qe7",
        // Engels, Reti
        "c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7 d3 O-O",
        "c4 e5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 e4 Nge7 Nge2 O-O O-O Be6",
        "Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4 Nc6 Re1 b5",
        "g3 d5 Bg2 Nf6 Nf3 e6 O-O Be7 d3 O-O Nbd2 c5",
        "b3 e5 Bb2 Nc6 e3 d5 Bb5 Bd6 Nf3 Qe7",
        "f4 d5 Nf3 Nf6 e3 g6 Be2 Bg7 O-O O-O d3 c5"
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

    // Geeft tot 3 boekzetten terug (gekozen zet eerst) of null.
    bookMoves(chess) {

        if (!this.bookTree) {
            this.buildBook();
        }

        const hist = chess.history().map(m => m.replace(/[+#]/g, ""));

        if (hist.length > 24) {
            return null;
        }

        // Zonder zettengeschiedenis moet het de echte beginstelling zijn
        // (een stelling geladen uit een FEN is geen boekstelling).
        if (
            hist.length === 0 &&
            chess.fen().split(" ").slice(0, 4).join(" ") !==
                "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"
        ) {
            return null;
        }

        const node = this.bookTree.get(hist.join(" "));

        if (!node) {
            return null;
        }

        const full = chess.moves({ verbose: true });
        const cands = [];

        for (const [san, count] of node) {

            const m = full.find(x => x.san.replace(/[+#]/g, "") === san);

            if (m) {
                cands.push({ move: m, weight: count });
            }
        }

        if (!cands.length) {
            return null;
        }

        let r = Math.random() * cands.reduce((a, c) => a + c.weight, 0);
        let pick = 0;

        for (let i = 0; i < cands.length; i++) {
            r -= cands[i].weight;
            if (r <= 0) { pick = i; break; }
        }

        const chosen = cands.splice(pick, 1)[0];

        return [chosen, ...cands]
            .slice(0, 3)
            .map(c => ({
                move: c.move,
                score: this.quickEval(chess, c.move)
            }));
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

            this.undo(chess);

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

    search(chess, depth, alpha, beta, ply, allowNull = true) {

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
            // Na een nulzet is de zettenlijst niet echt: geen herhalingscheck.
            const draw = (ply <= 3 && this.nullDepth === 0)
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

        const moves = this.genMoves(chess);

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

        // Nulzet-snoei: als we zelfs na een "pas" nog boven beta staan,
        // is deze tak niet interessant. Werkt met gewone chess.js: er
        // wordt een losse, wegwerpbare kopie van het bord gemaakt met
        // de beurt omgedraaid, dus de echte chess-instantie van de
        // pagina wordt hier niet voor aangeraakt.
        if (
            allowNull &&
            depth >= 3 &&
            !inCheck &&
            ply > 0 &&
            Math.abs(beta) < this.MATE - 1000 &&
            this.hasPieces(key) &&
            this.evaluate(chess) >= beta
        ) {

            const nullBoard = this.passMove(chess);

            if (nullBoard) {

                const R = depth > 6 ? 3 : 2;

                this.nullDepth++;

                const nullScore = -this.search(
                    nullBoard, depth - 1 - R, -beta, -beta + 1, ply + 1, false
                );

                this.nullDepth--;

                if (this.stopped) {
                    return 0;
                }

                if (nullScore >= beta) {
                    return nullScore >= this.MATE - 1000 ? beta : nullScore;
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

            this.undo(chess);

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

        let moves = this.genMoves(chess);

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

            this.undo(chess);

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
        const occ = this.blockers;

        occ.fill(0);

        let score = 0;   // vanuit wit
        let npm = 0;     // niet-pion materiaal (beide kanten)

        const pawnRows = {
            w: Array.from({ length: 8 }, () => []),
            b: Array.from({ length: 8 }, () => [])
        };

        const bishops = { w: 0, b: 0 };
        const rooks = [];
        const kings = {};
        const pieces = [];

        for (let r = 0; r < 8; r++) {

            for (let c = 0; c < 8; c++) {

                const p = board[r][c];

                if (!p) {
                    continue;
                }

                const sign = p.color === "w" ? 1 : -1;

                occ[r * 8 + c] = 1;

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
                pieces.push({ color: p.color, type: p.type, r, c });

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

                score += sign * Math.round(
                    shield * (
                        10 * mg +
                        8 * this.openingWeight * this.DEFENSIVE_OPENING
                    )
                );
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

        // Aanval op de koning (voorzichtig eigen koning, gretig bij kans).
        score += this.kingDanger(pieces, kings, pawnRows, mg);

        // Verdedigende opening (dooft uit naarmate het spel vordert).
        if (this.openingWeight > 0 && this.DEFENSIVE_OPENING > 0) {
            score += Math.round(
                this.openingSolidity(board, kings) *
                this.openingWeight *
                this.DEFENSIVE_OPENING
            );
        }

        // Naar de kant van de speler die aan zet is + kleine tempo-bonus.
        return (chess.turn() === "w" ? score : -score) + 10;
    },

    // ---------------------------------------------------------
    // KONINGSGEVAAR
    //
    // Telt hoeveel stukken de zone rond een koning aanvallen.
    // Pas bij minstens twee aanvallers (met dame) of drie aanvallers
    // wordt het echt gevaarlijk; het gevaar groeit kwadratisch,
    // dus een serieuze aanval is meer waard dan een stuk.
    // Score vanuit wit.
    // ---------------------------------------------------------

    kingDanger(pieces, kings, pawnRows, mg) {

        if (mg < 0.35 || pieces.length === 0) {
            return 0;
        }

        const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const WEIGHT = { n: 2, b: 2, r: 3, q: 5 };

        let total = 0;

        for (const att of ["w", "b"]) {

            const def = att === "w" ? "b" : "w";
            const k = kings[def];

            if (!k) {
                continue;
            }

            // Zone: rond de koning, 2 rijen richting het midden.
            const fwd = def === "w" ? -1 : 1;

            const rA = k.r;
            const rB = Math.max(0, Math.min(7, k.r + 2 * fwd));
            const rC = Math.max(0, Math.min(7, k.r - fwd));
            const rMin = Math.min(rA, rB, rC);
            const rMax = Math.max(rA, rB, rC);
            const cMin = Math.max(0, k.c - 1);
            const cMax = Math.min(7, k.c + 1);

            let units = 0;
            let attackers = 0;
            let hasQueen = false;

            for (const pc of pieces) {

                if (pc.color !== att) {
                    continue;
                }

                let hits = 0;

                if (pc.type === "n") {

                    for (const [dr, dc] of KN) {

                        const rr = pc.r + dr;
                        const cc = pc.c + dc;

                        if (rr >= rMin && rr <= rMax && cc >= cMin && cc <= cMax) {
                            hits++;
                        }
                    }

                } else {

                    const dirs = pc.type === "b"
                        ? DIAG
                        : pc.type === "r"
                            ? ORTH
                            : DIAG.concat(ORTH);

                    for (const [dr, dc] of dirs) {

                        let rr = pc.r + dr;
                        let cc = pc.c + dc;

                        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {

                            if (
                                rr >= rMin && rr <= rMax &&
                                cc >= cMin && cc <= cMax
                            ) {
                                hits++;
                            }

                            if (this.blockers[rr * 8 + cc]) {
                                break;
                            }

                            rr += dr;
                            cc += dc;
                        }
                    }
                }

                if (hits > 0) {
                    attackers++;
                    units += WEIGHT[pc.type] + hits;
                    if (pc.type === "q") hasQueen = true;
                }
            }

            if (attackers < 2 || (attackers < 3 && !hasQueen)) {
                continue;
            }

            let danger = Math.min(this.DANGER_CAP, units * units * 0.75);

            // Ontbrekend pionnenschild maakt de aanval sterker.
            let missing = 0;

            for (let f = cMin; f <= cMax; f++) {

                const rows = pawnRows[def][f];
                let shield = false;

                for (const pr of rows) {
                    if (def === "w" ? pr < k.r : pr > k.r) {
                        shield = true;
                        break;
                    }
                }

                if (!shield) missing++;
            }

            danger *= 1 + 0.2 * missing;

            // Eigen koning in gevaar telt zwaarder; eigen aanval in de
            // opening iets gedempt.
            let weight;

            if (def === this.botColor) {
                weight = this.DEFENSE_SCALE;
            } else {
                weight = this.ATTACK_SCALE *
                    (1 - 0.5 * this.openingWeight);
            }

            total += (att === "w" ? 1 : -1) * danger * weight * mg;
        }

        return Math.round(total);
    },

    // ---------------------------------------------------------
    // OPENING: SOLIDE EN VERDEDIGEND
    //
    // Beloont: rokeren, ontwikkelde stukken, dame die thuis blijft
    // tot de stukken uit zijn, gedekte pionnen.
    // Straft: koning in het midden, flankpionnen die vooruit stormen,
    // vroege damezetten.
    // Score vanuit wit.
    // ---------------------------------------------------------

    openingSolidity(board, kings) {

        let total = 0;

        for (const color of ["w", "b"]) {

            const sign = color === "w" ? 1 : -1;
            const homeRow = color === "w" ? 7 : 0;
            const pawnBehind = color === "w" ? 1 : -1;

            let s = 0;

            // Koning: gerokeerd is veilig.
            const k = kings[color];

            if (k) {
                if (
                    k.r === homeRow &&
                    (k.c === 6 || k.c === 2 || k.c === 7 || k.c === 1)
                ) {
                    s += 45;
                } else if (k.r === homeRow && k.c === 4) {
                    s -= 15;
                } else {
                    s -= 40;
                }
            }

            // Stukken die nog op hun beginveld staan.
            // Lopers wegen zwaarder: die moeten snel het spel in.
            let undevKnights = 0;
            let undevBishops = 0;

            for (const c of [1, 2, 5, 6]) {

                const p = board[homeRow][c];

                if (p && p.color === color) {
                    if (p.type === "n") undevKnights++;
                    if (p.type === "b") undevBishops++;
                }
            }

            const undeveloped = undevKnights + undevBishops;

            s -= undevKnights * 12 + undevBishops * 24;

            // Eén doorloop: dame, flankpionnen, gedekte pionnen.
            let queenAway = false;

            for (let r = 0; r < 8; r++) {

                for (let c = 0; c < 8; c++) {

                    const p = board[r][c];

                    if (!p || p.color !== color) {
                        continue;
                    }

                    if (p.type === "q" && !(r === homeRow && c === 3)) {
                        queenAway = true;
                    }

                    if (p.type === "b") {

                        // Loper: hoe meer vrije diagonaal, hoe beter.
                        let mob = 0;

                        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {

                            let rr = r + dr;
                            let cc = c + dc;

                            while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {

                                const t = board[rr][cc];

                                if (!t) {
                                    mob++;
                                } else {
                                    if (t.color !== color) mob++;
                                    break;
                                }

                                rr += dr;
                                cc += dc;
                            }
                        }

                        s += Math.min(mob, 9) * 4;

                        // Fianchetto (b2/g2 of b7/g7 achter een pion op b3/g3, b6/g6).
                        const fianchettoRow = color === "w" ? 6 : 1;

                        if (r === fianchettoRow && (c === 1 || c === 6)) {

                            const front = board[r - pawnBehind][c];

                            if (front && front.color === color && front.type === "p") {
                                s += 15;
                            }
                        }

                        continue;
                    }

                    if (p.type !== "p") {
                        continue;
                    }

                    // Flankpionnen (a, b, f, g, h) niet te ver vooruit.
                    const adv = color === "w" ? 6 - r : r - 1;

                    if ((c <= 1 || c >= 5) && adv >= 2) {
                        s -= 10;
                    }

                    // Gedekte pion (pionnenketen).
                    const br = r + pawnBehind;

                    if (br >= 0 && br < 8) {

                        for (const dc of [-1, 1]) {

                            const bc = c + dc;

                            if (bc < 0 || bc > 7) {
                                continue;
                            }

                            const q = board[br][bc];

                            if (q && q.color === color && q.type === "p") {
                                s += 5;
                                break;
                            }
                        }
                    }
                }
            }

            // Dame te vroeg naar voren terwijl stukken nog slapen.
            if (queenAway && undeveloped > 0) {
                s -= undeveloped * 10;
            }

            total += sign * s;
        }

        return total;
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

            // Opening: loper van zijn beginveld eerst proberen.
            if (
                this.openingWeight > 0 &&
                move.piece === "b" &&
                (move.from === "c1" || move.from === "f1" ||
                 move.from === "c8" || move.from === "f8")
            ) {
                s += 5000;
            }
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

    genMoves(chess) {

        return chess.moves({ verbose: true });
    },

    play(chess, move) {

        chess.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || "q"
        });
    },

    undo(chess) {

        chess.undo();
    },

    // Losse, wegwerpbare stelling met de beurt omgedraaid ("passen"),
    // voor nulzet-snoeiing. Gebruikt alleen fen()/de globale Chess-
    // constructor, dus de echte spelinstantie blijft onaangeroerd.
    // Retourneert null als dat om wat voor reden dan ook niet lukt;
    // de aanroeper slaat de snoeiing dan gewoon over.
    passMove(chess) {

        if (typeof Chess !== "function") {
            return null;
        }

        try {

            const parts = chess.fen().split(" ");

            parts[1] = parts[1] === "w" ? "b" : "w";
            parts[3] = "-";

            return new Chess(parts.join(" "));

        } catch (e) {

            return null;
        }
    },

    // FEN zonder zetteller: dezelfde stelling = dezelfde sleutel.
    key(chess) {

        return chess.fen().split(" ").slice(0, 4).join(" ");
    },

    // Heeft de speler aan zet nog andere stukken dan pionnen en koning?
    hasPieces(key) {

        const sp = key.indexOf(" ");
        const placement = key.slice(0, sp);

        return key.charAt(sp + 1) === "w"
            ? /[NBRQ]/.test(placement)
            : /[nbrq]/.test(placement);
    },

    moveKey(move) {

        return move.from + move.to + (move.promotion || "");
    },

    outOfTime() {

        return (
            performance.now() - this.startTime >= this.timeLimit
        );
    }
};
