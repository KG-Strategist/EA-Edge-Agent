import fs from 'fs';
import path from 'path';
import nlp from 'compromise';

const lexiconMap = new Map<string, Record<string, number>>();

const processText = (text: string) => {
  const doc = nlp(text);
  const json = doc.json();
  
  json.forEach((sentence: any) => {
    sentence.terms.forEach((term: any) => {
      const word = term.normal;
      const tags = term.tags;
      let role = null;
      
      if (tags.includes('Noun')) role = 'Entity';
      else if (tags.includes('Verb')) role = 'Intent';
      else if (tags.includes('Adjective')) role = 'EntityDescriber';
      else if (tags.includes('Adverb')) role = 'IntentAccel';
      
      if (role && word) {
        if (!lexiconMap.has(word)) {
          lexiconMap.set(word, {});
        }
        const counts = lexiconMap.get(word)!;
        counts[role] = (counts[role] || 0) + 1;
      }
    });
  });
};

const main = () => {
  const basePath = process.cwd();
  const eePath = path.join(basePath, 'public', 'ee.csv');
  const readmePath = path.join(basePath, 'README.md');
  const outPath = path.join(basePath, 'public', 'lexicon.json');

  // Graceful exit for open-source deployments without proprietary raw data
  const wordsPath = path.join(basePath, 'public', 'words.txt');
  if (!fs.existsSync(wordsPath)) {
    console.log('📘 NOTICE: Proprietary lexicon not found. Skipping compilation. The application will use the pre-packaged OOB Brain.');
    process.exit(0);
  }

  if (fs.existsSync(eePath)) {
    const lines = fs.readFileSync(eePath, 'utf-8').split('\n');
    lines.forEach(line => processText(line));
  }

  if (fs.existsSync(readmePath)) {
    const lines = fs.readFileSync(readmePath, 'utf-8').split('\n');
    lines.forEach(line => processText(line));
  }

  const finalLexicon: Record<string, string> = {};

  for (const [word, counts] of lexiconMap.entries()) {
    let dominantRole = '';
    let maxCount = 0;
    for (const [role, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantRole = role;
      }
    }
    finalLexicon[word] = dominantRole;
  }

  fs.writeFileSync(outPath, JSON.stringify(finalLexicon, null, 2));
  console.log('Lexicon compiled successfully!');
};

main();
