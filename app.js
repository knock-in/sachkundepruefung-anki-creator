import cheerio from 'cheerio';
import { get } from 'http';
import { createWriteStream, readFileSync } from 'fs';
import { readdir, readFile, writeFile } from 'fs/promises';
import AnkiExport from 'anki-apkg-export';
import Handlebars from 'handlebars';
import './templates/templates.cjs';
import _ from 'lodash';

const sitePath = 'https://roadsterspass.de/lucky/';

let questionPages = [];
try {
    const questionPageFiles = await readdir('./questionPages');
    questionPages = await Promise.all(questionPageFiles.map((questionPageFileName) => {
        return readFile(`./questionPages/${questionPageFileName}`, 'utf-8');
    }));
    console.log(questionPages);
} catch (err) {
    console.error(err);
}

const frontTemplate = Handlebars.templates['front.hbs'];
const backTemplate = Handlebars.templates['back.hbs'];
const apkg = new AnkiExport.default('sachkundenachweis');

function getAnswers(paragraphs) {
    const answers = [];
    answers.push({
        text: paragraphs.childNodes[2].data,
        isTrue: paragraphs.childNodes[1].attribs.value === '1'
    });

    answers.push({
        text: paragraphs.childNodes[6].data,
        isTrue: paragraphs.childNodes[5].attribs.value === '1'
    });

    if (paragraphs.childNodes.length === 15) {
        answers.push({
            text: paragraphs.childNodes[10].data,
            isTrue: paragraphs.childNodes[9].attribs.value === '1'
        });

        answers.push({
            text: paragraphs.childNodes[14].data,
            isTrue: paragraphs.childNodes[13].attribs.value === '1'
        });
    }
    return answers;
}

const questionsPerPage = questionPages.map((questionPage, pageIndex) => {
    const $ = cheerio.load(questionPage.toString(), { decodeEntities: true });
    const $form = $('form');

    return $form.toArray().map(($question, questionIndex) => {
        const paragraphs = $('p', $question).toArray();
        const question = {
            id: parseInt(paragraphs[0].firstChild.firstChild.data.match(/Fragebogen [0-9]+ - Frage (.*)/)[1], 10),
            title: '',
            img: null,
            answers: []
        };
        question.title = paragraphs[1].firstChild.children[0].data;

        if (paragraphs.length === 4) {
            // without img
            question.answers = getAnswers(paragraphs[2]);
        } else if (paragraphs.length === 5) {
            // with img
            question.img = paragraphs[2].firstChild.attribs.src;
            question.answers = getAnswers(paragraphs[3]);
        } else {
            throw 'something went wront';
        }
        return question;
    });

    // TODO download image if neccessary
});

const questions = _.flatten(questionsPerPage);
_.forEach(questions, async (question) => {
    if (question.img) {
        console.log(question);
        apkg.addMedia(question.img, readFileSync(`./imgs/${question.img}`));
    }
    apkg.addCard(frontTemplate(question), backTemplate(question));
});

apkg
  .save()
  .then(async zip => {
    await writeFile('./sachkundenachweis.apkg', zip, 'binary');
    console.log(`Package has been generated: sachkundenachweis.pkg`);
  })
  .catch(err => console.log(err.stack || err));
