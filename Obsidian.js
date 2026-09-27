// ============================================
// OBSIDIAN CHESS ENGINE
// ============================================

const Obsidian = {

    // ========================================
    // INSTELLINGEN
    // ========================================

    SEARCH_DEPTH: 5,


    // ========================================
    // STUKWAARDES
    // ========================================

    PIECE_VALUES: {

        p: 100,
        n: 320,
        b: 330,
        r: 500,
        q: 900,
        k: 20000

    },


    // ========================================
    // BESTE ZET
    // ========================================

    getBestMove(chess) {

        const topMoves =
            this.getTopMoves(
                chess,
                1
            );


        if (
            !topMoves ||
            topMoves.length === 0
        ) {
            return null;
        }


        return topMoves[0].move;
    },


    // ========================================
    // TOP MOVES
    // ========================================

    getTopMoves(
        chess,
        amount = 3
    ) {

        const botColor =
            chess.turn();


        const moves =
            chess.moves({
                verbose: true
            });


        if (moves.length === 0) {
            return [];
        }


        const results = [];


        // Eerst tactisch interessante zetten
        // bekijken. Dit maakt alpha-beta
        // veel effectiever.
        const orderedMoves =
            this.orderMoves(
                chess,
                moves
            );


        for (
            const move of orderedMoves
        ) {

            chess.move({
                from: move.from,
                to: move.to,
                promotion: "q"
            });


            const score =
                this.minimax(
                    chess,
                    this.SEARCH_DEPTH - 1,
                    -Infinity,
                    Infinity,
                    botColor
                );


            chess.undo();


            results.push({
                move: move,
                score: score
            });
        }


        // Hoogste score eerst.
        results.sort(
            (a, b) =>
                b.score - a.score
        );


        return results.slice(
            0,
            amount
        );
    },


    // ========================================
    // MINIMAX
    // ========================================

    minimax(
        chess,
        depth,
        alpha,
        beta,
        botColor
    ) {

        // ------------------------------------
        // SCHAAKMAT
        // ------------------------------------

        if (chess.in_checkmate()) {

            if (
                chess.turn() === botColor
            ) {

                return -1000000;
            }


            return 1000000;
        }


        // ------------------------------------
        // REMISE
        // ------------------------------------

        if (
            chess.in_draw() ||
            chess.in_stalemate() ||
            chess.in_threefold_repetition() ||
            chess.insufficient_material()
        ) {

            return 0;
        }


        // ------------------------------------
        // LEAF
        // ------------------------------------

        if (depth <= 0) {

            return this.evaluate(
                chess,
                botColor
            );
        }


        const moves =
            chess.moves({
                verbose: true
            });


        const orderedMoves =
            this.orderMoves(
                chess,
                moves
            );


        const maximizing =
            chess.turn() === botColor;


        // ====================================
        // MAX
        // ====================================

        if (maximizing) {

            let bestScore =
                -Infinity;


            for (
                const move of orderedMoves
            ) {

                chess.move({
                    from: move.from,
                    to: move.to,
                    promotion: "q"
                });


                const score =
                    this.minimax(
                        chess,
                        depth - 1,
                        alpha,
                        beta,
                        botColor
                    );


                chess.undo();


                bestScore =
                    Math.max(
                        bestScore,
                        score
                    );


                alpha =
                    Math.max(
                        alpha,
                        score
                    );


                if (
                    beta <= alpha
                ) {
                    break;
                }
            }


            return bestScore;
        }


        // ====================================
        // MIN
        // ====================================

        let bestScore =
            Infinity;


        for (
            const move of orderedMoves
        ) {

            chess.move({
                from: move.from,
                to: move.to,
                promotion: "q"
            });


            const score =
                this.minimax(
                    chess,
                    depth - 1,
                    alpha,
                    beta,
                    botColor
                );


            chess.undo();


            bestScore =
                Math.min(
                    bestScore,
                    score
                );


            beta =
                Math.min(
                    beta,
                    score
                );


            if (
                beta <= alpha
            ) {
                break;
            }
        }


        return bestScore;
    },


    // ========================================
    // POSITION EVALUATION
    // ========================================

    evaluate(
        chess,
        botColor
    ) {

        const opponent =
            botColor === "w"
                ? "b"
                : "w";


        let score = 0;


        // ------------------------------------
        // 1. MATERIAAL
        // ------------------------------------

        score +=
            this.evaluateMaterial(
                chess,
                botColor
            );


        // ------------------------------------
        // 2. KONINGVEILIGHEID
        // ------------------------------------

        score +=
            this.evaluateKingSafety(
                chess,
                botColor
            );


        // ------------------------------------
        // 3. VERDEDIGING
        // ------------------------------------

        score +=
            this.evaluateDefense(
                chess,
                botColor
            );


        // ------------------------------------
        // 4. CENTRUM
        // ------------------------------------

        score +=
            this.evaluateCenter(
                chess,
                botColor
            );


        // ------------------------------------
        // 5. MOBILITEIT
        // ------------------------------------

        score +=
            this.evaluateMobility(
                chess,
                botColor
            );


        // ------------------------------------
        // 6. AANVAL
        // ------------------------------------

        score +=
            this.evaluateAttack(
                chess,
                botColor
            );


        // ------------------------------------
        // 7. SCHAAK
        // ------------------------------------

        if (chess.in_check()) {

            if (
                chess.turn() === botColor
            ) {

                score -= 120;

            } else {

                score += 120;
            }
        }


        return score;
    },


    // ========================================
    // MATERIAL
    // ========================================

    evaluateMaterial(
        chess,
        botColor
    ) {

        let score = 0;


        const board =
            chess.board();


        for (
            const row of board
        ) {

            for (
                const piece of row
            ) {

                if (!piece) {
                    continue;
                }


                const value =
                    this.PIECE_VALUES[
                        piece.type
                    ];


                if (
                    piece.color === botColor
                ) {

                    score += value;

                } else {

                    score -= value;
                }
            }
        }


        return score;
    },


    // ========================================
    // KING SAFETY
    // ========================================

    evaluateKingSafety(
        chess,
        botColor
    ) {

        const board =
            chess.board();


        let score = 0;


        let king = null;


        // Zoek eigen koning.
        for (
            let row = 0;
            row < 8;
            row++
        ) {

            for (
                let col = 0;
                col < 8;
                col++
            ) {

                const piece =
                    board[row][col];


                if (
                    piece &&
                    piece.type === "k" &&
                    piece.color === botColor
                ) {

                    king = {
                        row: row,
                        col: col
                    };

                    break;
                }
            }


            if (king) {
                break;
            }
        }


        if (!king) {
            return 0;
        }


        // ------------------------------------
        // Koning staat niet schaak
        // ------------------------------------

        if (
            chess.turn() !== botColor ||
            !chess.in_check()
        ) {

            score += 10;
        }


        // ------------------------------------
        // Eigen pionnen rond koning
        // ------------------------------------

        const direction =
            botColor === "w"
                ? -1
                : 1;


        const pawnRow =
            king.row + direction;


        if (
            pawnRow >= 0 &&
            pawnRow < 8
        ) {

            for (
                let col =
                    king.col - 1;

                col <= king.col + 1;

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

                    score += 18;
                }
            }
        }


        return score;
    },


    // ========================================
    // DEFENSE
    // ========================================

    evaluateDefense(
        chess,
        botColor
    ) {

        const board =
            chess.board();


        let score = 0;


        /*
         * We geven bonus voor stukken die
         * door andere stukken ondersteund
         * worden.
         */

        for (
            let row = 0;
            row < 8;
            row++
        ) {

            for (
                let col = 0;
                col < 8;
                col++
            ) {

                const piece =
                    board[row][col];


                if (
                    !piece ||
                    piece.color !== botColor
                ) {
                    continue;
                }


                const square =
                    this.toSquare(
                        row,
                        col
                    );


                const defenders =
                    this.countDefenders(
                        chess,
                        square,
                        botColor
                    );


                if (defenders > 0) {

                    // Vooral waardevolle stukken
                    // wil Obsidian beschermd zien.
                    const value =
                        this.PIECE_VALUES[
                            piece.type
                        ];


                    if (value >= 500) {

                        score +=
                            defenders * 10;

                    } else {

                        score +=
                            defenders * 4;
                    }
                }
            }
        }


        return score;
    },


    // ========================================
    // COUNT DEFENDERS
    // ========================================

    countDefenders(
        chess,
        square,
        color
    ) {

        /*
         * chess.js geeft geen directe
         * "defenders of square"-functie.
         *
         * Daarom testen we welke eigen stukken
         * naar dat veld zouden kunnen bewegen.
         */

        let count = 0;


        const board =
            chess.board();


        for (
            let row = 0;
            row < 8;
            row++
        ) {

            for (
                let col = 0;
                col < 8;
                col++
            ) {

                const piece =
                    board[row][col];


                if (
                    !piece ||
                    piece.color !== color
                ) {
                    continue;
                }


                const from =
                    this.toSquare(
                        row,
                        col
                    );


                const moves =
                    chess.moves({
                        square: from,
                        verbose: true
                    });


                for (
                    const move of moves
                ) {

                    if (
                        move.to === square
                    ) {

                        count++;

                        break;
                    }
                }
            }
        }


        return count;
    },


    // ========================================
    // CENTER CONTROL
    // ========================================

    evaluateCenter(
        chess,
        botColor
    ) {

        const center = [
            "d4",
            "e4",
            "d5",
            "e5"
        ];


        let score = 0;


        for (
            const square of center
        ) {

            const piece =
                chess.get(square);


            if (!piece) {
                continue;
            }


            if (
                piece.color === botColor
            ) {

                score += 12;

            } else {

                score -= 12;
            }
        }


        return score;
    },


    // ========================================
    // MOBILITY
    // ========================================

    evaluateMobility(
        chess,
        botColor
    ) {

        /*
         * Mobiliteit is positief,
         * maar bewust niet heel zwaar.
         */

        const moves =
            chess.moves().length;


        if (
            chess.turn() === botColor
        ) {

            return moves * 3;
        }


        return -moves * 3;
    },


    // ========================================
    // ATTACK
    // ========================================

    evaluateAttack(
        chess,
        botColor
    ) {

        let score = 0;


        const moves =
            chess.moves({
                verbose: true
            });


        for (
            const move of moves
        ) {

            if (!move.captured) {
                continue;
            }


            const capturedValue =
                this.PIECE_VALUES[
                    move.captured
                ] || 0;


            const attackerValue =
                this.PIECE_VALUES[
                    move.piece
                ] || 0;


            /*
             * Een stuk slaan is goed.
             */
            score +=
                capturedValue * 0.04;


            /*
             * Grote stukken slaan krijgt
             * een extra bonus.
             */
            if (
                capturedValue >= 500
            ) {

                score += 15;
            }


            /*
             * Een duur stuk voor een goedkoper
             * stuk opofferen wordt ontmoedigd.
             */
            if (
                attackerValue >
                capturedValue
            ) {

                score -= 10;
            }
        }


        return score;
    },


    // ========================================
    // MOVE ORDERING
    // ========================================

    orderMoves(
        chess,
        moves
    ) {

        /*
         * BELANGRIJK:
         *
         * We gebruiken hier geen ingewikkelde
         * evaluatie. Dit is alleen om sterke
         * kandidaten eerst te bekijken.
         */

        return moves.sort(
            (a, b) => {

                let scoreA = 0;
                let scoreB = 0;


                // --------------------------------
                // CAPTURES
                // --------------------------------

                if (a.captured) {

                    scoreA +=
                        (
                            this.PIECE_VALUES[
                                a.captured
                            ] || 0
                        ) * 10;
                }


                if (b.captured) {

                    scoreB +=
                        (
                            this.PIECE_VALUES[
                                b.captured
                            ] || 0
                        ) * 10;
                }


                // --------------------------------
                // PROMOTION
                // --------------------------------

                if (a.promotion) {
                    scoreA += 8000;
                }


                if (b.promotion) {
                    scoreB += 8000;
                }


                // --------------------------------
                // CHECK
                // --------------------------------

                if (
                    this.moveGivesCheck(
                        chess,
                        a
                    )
                ) {

                    scoreA += 5000;
                }


                if (
                    this.moveGivesCheck(
                        chess,
                        b
                    )
                ) {

                    scoreB += 5000;
                }


                return scoreB - scoreA;
            }
        );
    },


    // ========================================
    // MOVE GIVES CHECK
    // ========================================

    moveGivesCheck(
        chess,
        move
    ) {

        chess.move({
            from: move.from,
            to: move.to,
            promotion:
                move.promotion || "q"
        });


        const givesCheck =
            chess.in_check();


        chess.undo();


        return givesCheck;
    },


    // ========================================
    // COORDINATES
    // ========================================

    toSquare(
        row,
        col
    ) {

        const file =
            String.fromCharCode(
                97 + col
            );


        const rank =
            8 - row;


        return `${file}${rank}`;
    }

};
