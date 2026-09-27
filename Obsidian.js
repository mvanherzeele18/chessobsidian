// ============================================
// OBSIDIAN CHESS ENGINE
// ============================================

const Obsidian = {

    // Begin met 3.
    // Later kunnen we dit naar 5 zetten.
    SEARCH_DEPTH: 3,


    // Waarde van de stukken
    PIECE_VALUES: {
        p: 100,
        n: 320,
        b: 330,
        r: 500,
        q: 900,
        k: 20000
    },


    // ========================================
    // PUBLIC FUNCTION
    // ========================================

    getBestMove(chess) {

        const botColor = chess.turn();

        const moves = chess.moves({
            verbose: true
        });

        if (moves.length === 0) {
            return null;
        }


        let bestMove = moves[0];

        let bestScore = -Infinity;


        // Zetvolgorde verbeteren.
        // Sterke tactische zetten eerst bekijken.
        const orderedMoves =
            this.orderMoves(chess, moves);


        for (const move of orderedMoves) {

            chess.move({
                from: move.from,
                to: move.to,
                promotion: "q"
            });


            const score = this.minimax(
                chess,
                this.SEARCH_DEPTH - 1,
                -Infinity,
                Infinity,
                botColor
            );


            chess.undo();


            if (score > bestScore) {

                bestScore = score;
                bestMove = move;
            }
        }


        return bestMove;
    },


    // ========================================
    // MINIMAX + ALPHA BETA
    // ========================================

    minimax(
        chess,
        depth,
        alpha,
        beta,
        botColor
    ) {

        // Einde van de zoekdiepte
        if (depth === 0) {
            return this.evaluate(
                chess,
                botColor
            );
        }


        // Schaakmat
        if (chess.isCheckmate()) {

            // De speler die nu aan zet is,
            // staat schaakmat.

            if (chess.turn() === botColor) {
                return -1000000;
            }

            return 1000000;
        }


        // Remise
        if (
            chess.isDraw() ||
            chess.isStalemate() ||
            chess.isThreefoldRepetition() ||
            chess.isInsufficientMaterial()
        ) {
            return 0;
        }


        const moves = chess.moves({
            verbose: true
        });


        const orderedMoves =
            this.orderMoves(chess, moves);


        const maximizing =
            chess.turn() === botColor;


        // ====================================
        // MAXIMIZING
        // ====================================

        if (maximizing) {

            let bestScore = -Infinity;


            for (const move of orderedMoves) {

                chess.move({
                    from: move.from,
                    to: move.to,
                    promotion: "q"
                });


                const score = this.minimax(
                    chess,
                    depth - 1,
                    alpha,
                    beta,
                    botColor
                );


                chess.undo();


                bestScore =
                    Math.max(bestScore, score);

                alpha =
                    Math.max(alpha, score);


                if (beta <= alpha) {
                    break;
                }
            }


            return bestScore;
        }


        // ====================================
        // MINIMIZING
        // ====================================

        let bestScore = Infinity;


        for (const move of orderedMoves) {

            chess.move({
                from: move.from,
                to: move.to,
                promotion: "q"
            });


            const score = this.minimax(
                chess,
                depth - 1,
                alpha,
                beta,
                botColor
            );


            chess.undo();


            bestScore =
                Math.min(bestScore, score);

            beta =
                Math.min(beta, score);


            if (beta <= alpha) {
                break;
            }
        }


        return bestScore;
    },


    // ========================================
    // BOARD EVALUATION
    // ========================================

    evaluate(chess, botColor) {

        const board = chess.board();

        const opponent =
            botColor === "w" ? "b" : "w";


        let score = 0;


        // ------------------------------------
        // 1. MATERIAAL
        // ------------------------------------

        for (const row of board) {

            for (const piece of row) {

                if (!piece) {
                    continue;
                }


                const value =
                    this.PIECE_VALUES[piece.type];


                if (piece.color === botColor) {
                    score += value;
                } else {
                    score -= value;
                }
            }
        }


        // ------------------------------------
        // 2. KONINGVEILIGHEID
        // ------------------------------------

        if (chess.in_check()) {

            if (chess.turn() === botColor) {

                // Obsidian staat schaak.
                score -= 120;

            } else {

                // Tegenstander staat schaak.
                score += 120;
            }
        }


        // ------------------------------------
        // 3. MOBILITEIT
        // ------------------------------------

        const currentTurn = chess.turn();

        const legalMoves =
            chess.moves({
                verbose: true
            });


        let mobility =
            legalMoves.length;


        /*
         * Mobiliteit is nuttig, maar niet enorm
         * belangrijk. Obsidian moet geen
         * agressieve "move spammer" worden.
         */

        if (currentTurn === botColor) {
            score += mobility * 3;
        } else {
            score -= mobility * 3;
        }


        // ------------------------------------
        // 4. STUKKEN IN HET CENTRUM
        // ------------------------------------

        score += this.evaluateCenter(
            chess,
            botColor
        );


        // ------------------------------------
        // 5. VERDEDIGING
        // ------------------------------------

        score += this.evaluateDefense(
            chess,
            botColor
        );


        // ------------------------------------
        // 6. AANVALSPOTENTIE
        // ------------------------------------

        score += this.evaluateAttack(
            chess,
            botColor
        );


        return score;
    },


    // ========================================
    // CENTER
    // ========================================

    evaluateCenter(chess, botColor) {

        const board = chess.board();

        let score = 0;


        const centerSquares = [
            "d4",
            "e4",
            "d5",
            "e5"
        ];


        for (const square of centerSquares) {

            const file =
                square.charCodeAt(0) - 97;

            const rank =
                8 - parseInt(square[1]);


            const piece =
                board[rank][file];


            if (!piece) {
                continue;
            }


            if (piece.color === botColor) {

                // Centrumcontrole is goed,
                // maar krijgt geen enorme bonus.
                score += 12;

            } else {

                score -= 12;
            }
        }


        return score;
    },


    // ========================================
    // DEFENSE
    // ========================================

    evaluateDefense(chess, botColor) {

        let score = 0;


        /*
         * Obsidian krijgt een bonus als zijn
         * koning veilig achter pionnen staat.
         */

        const board = chess.board();


        let kingSquare = null;


        for (let row = 0; row < 8; row++) {

            for (let col = 0; col < 8; col++) {

                const piece = board[row][col];

                if (
                    piece &&
                    piece.type === "k" &&
                    piece.color === botColor
                ) {

                    kingSquare = {
                        row,
                        col
                    };

                    break;
                }
            }

            if (kingSquare) {
                break;
            }
        }


        if (kingSquare) {

            const direction =
                botColor === "w" ? -1 : 1;


            const pawnRow =
                kingSquare.row + direction;


            if (
                pawnRow >= 0 &&
                pawnRow < 8
            ) {

                for (
                    let col = kingSquare.col - 1;
                    col <= kingSquare.col + 1;
                    col++
                ) {

                    if (
                        col < 0 ||
                        col > 7
                    ) {
                        continue;
                    }


                    const piece =
                        board[pawnRow][col];


                    if (
                        piece &&
                        piece.color === botColor &&
                        piece.type === "p"
                    ) {

                        score += 15;
                    }
                }
            }
        }


        /*
         * Niet zomaar stukken weggeven.
         *
         * We geven extra waarde aan materiaal
         * wanneer Obsidian nog relatief veel
         * stukken heeft.
         */

        const ownPieces =
            this.countPieces(
                chess,
                botColor
            );


        if (ownPieces >= 10) {
            score += 8;
        }


        return score;
    },


    // ========================================
    // ATTACK
    // ========================================

    evaluateAttack(chess, botColor) {

        let score = 0;


        const moves = chess.moves({
            verbose: true
        });


        for (const move of moves) {

            /*
             * Een aanval wordt pas echt interessant
             * wanneer er concreet materiaal te winnen is.
             */

            if (move.captured) {

                const capturedValue =
                    this.PIECE_VALUES[
                        move.captured
                    ] || 0;


                const attackerValue =
                    this.PIECE_VALUES[
                        move.piece
                    ] || 0;


                // Een goedkope aanvaller die een
                // duur stuk kan slaan is interessant.
                score +=
                    capturedValue * 0.04;


                // Dame/toren winnen is extra interessant.
                if (
                    capturedValue >= 500
                ) {
                    score += 15;
                }


                // Een offer met een duur stuk
                // wordt niet automatisch beloond.
                if (
                    attackerValue >
                    capturedValue
                ) {
                    score -= 10;
                }
            }
        }


        /*
         * Als de tegenstander weinig verdediging
         * heeft, krijgt Obsidian wat extra
         * aanvalspotentieel.
         */

        const opponent =
            botColor === "w"
                ? "b"
                : "w";


        const opponentMoves =
            this.countLegalMovesFor(
                chess,
                opponent
            );


        if (opponentMoves <= 10) {
            score += 8;
        }


        return score;
    },


    // ========================================
    // COUNT PIECES
    // ========================================

    countPieces(chess, color) {

        let count = 0;

        const board = chess.board();


        for (const row of board) {

            for (const piece of row) {

                if (
                    piece &&
                    piece.color === color
                ) {
                    count++;
                }
            }
        }


        return count;
    },


    // ========================================
    // COUNT LEGAL MOVES
    // ========================================

    countLegalMovesFor(chess, color) {

        if (chess.turn() === color) {

            return chess.moves().length;
        }


        /*
         * We kunnen hier niet zomaar de beurt
         * veranderen zonder de positie te veranderen.
         *
         * Daarom gebruiken we voor de evaluatie
         * alleen de huidige legal moves.
         */

        return chess.moves().length;
    },


    // ========================================
    // MOVE ORDERING
    // ========================================

    orderMoves(chess, moves) {

        return moves.sort((a, b) => {

            let scoreA = 0;
            let scoreB = 0;


            // Captures eerst
            if (a.captured) {

                scoreA +=
                    this.PIECE_VALUES[
                        a.captured
                    ] || 0;
            }


            if (b.captured) {

                scoreB +=
                    this.PIECE_VALUES[
                        b.captured
                    ] || 0;
            }


            // Promotie is zeer belangrijk
            if (a.promotion) {
                scoreA += 800;
            }


            if (b.promotion) {
                scoreB += 800;
            }


            // Checks krijgen voorrang
            const resultA =
                this.testMove(chess, a);

            const resultB =
                this.testMove(chess, b);


            if (resultA.check) {
                scoreA += 500;
            }


            if (resultB.check) {
                scoreB += 500;
            }


            return scoreB - scoreA;
        });
    },


    // ========================================
    // TEST MOVE
    // ========================================

    testMove(chess, move) {

        chess.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || "q"
        });


        const result = {
            check: chess.in_check(),
            mate: chess.isCheckmate()
        };


        chess.undo();


        return result;
    }

};
