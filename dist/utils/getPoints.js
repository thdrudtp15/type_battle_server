export const getPointsAndAccuracy = (logs) => {
    let totalPoints = 0;
    logs.forEach((log) => {
        let points = 0;
        log.sentence.split('').forEach((char, index) => {
            if (char === log.typing[index]) {
                points++;
            }
        });
        const accuracy = (points / log.sentence.length) * 100;
        totalPoints += accuracy;
    });
    return { points: Math.round(totalPoints), accuracy: Math.round(totalPoints / logs.length) };
};
