const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Маршрут для получения списка игр
app.get('/api/games', (req, res) => {
    const games = [
        { id: 1, name: 'Cyberpunk 2077', price: 59.99 },
        { id: 2, name: 'The Witcher 3', price: 39.99 },
        { id: 3, name: 'Red Dead Redemption 2', price: 49.99 },
    ];
    res.json(games);
});

// Маршрут для поиска игры по названию
app.get('/api/games/:name', (req, res) => {
    const gameName = req.params.name.toLowerCase();
    const games = [
        { id: 1, name: 'Cyberpunk 2077', price: 59.99 },
        { id: 2, name: 'The Witcher 3', price: 39.99 },
        { id: 3, name: 'Red Dead Redemption 2', price: 49.99 },
    ];
    const game = games.find(g => g.name.toLowerCase() === gameName);
    if (game) {
        res.json(game);
    } else {
        res.status(404).send('Game not found');
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});