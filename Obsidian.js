// ============================================
// OBSIDIAN CHESS ENGINE
// ============================================

const Obsidian = {

    /*
     * Geef een willekeurige legale zet terug.
     *
     * chess = de huidige Chess.js game.
     */
    getRandomMove(chess) {

        const legalMoves =
            chess.moves({
                verbose: true
            });


        // Geen mogelijke zetten
        if (legalMoves.length === 0) {
            return null;
        }


        // Kies willekeurige index
        const randomIndex =
            Math.floor(
                Math.random() * legalMoves.length
            );


        return legalMoves[randomIndex];
    }

};
