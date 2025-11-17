import {
    TONGUE_TWISTERS,
    FUNNY_SENTENCES,
    WISE_SAYINGS,
    STORY_SENTENCES,
    ANIMAL_SENTENCES,
} from '../constants/sentences.js';

export const getSentence = () => {
    const sentences = [
        [...TONGUE_TWISTERS],
        [...FUNNY_SENTENCES],
        [...WISE_SAYINGS],
        [...STORY_SENTENCES],
        [...ANIMAL_SENTENCES],
    ];
    const randomIndex = Math.floor(Math.random() * sentences.length);
    return sentences[randomIndex];
};
