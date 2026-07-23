import type {
  Puzzle,
  PuzzleType,
  CaesarCipherContent,
  NumberCodeContent,
  AnagramContent,
  ReverseMessageContent,
  FirstLettersContent,
  KeyboardShiftContent,
  MissingVowelsContent,
  MorseCodeContent,
  LetterMathContent,
  WordChainContent,
} from "../types/game";
import "./styles/PuzzleRenderer.css";

interface PuzzleRendererProps {
  puzzle: Puzzle;
}

export default function PuzzleRenderer({ puzzle }: PuzzleRendererProps) {
  return (
    <div className="puzzle-renderer">
      {renderByType(puzzle.type, puzzle.content)}
    </div>
  );
}

function renderByType(type: PuzzleType, content: Puzzle["content"]) {
  switch (type) {
    case "caesar_cipher":
      return <CaesarCipher content={content as CaesarCipherContent} />;
    case "number_code":
      return <NumberCode content={content as NumberCodeContent} />;
    case "anagram":
      return <Anagram content={content as AnagramContent} />;
    case "reverse_message":
      return <ReverseMessage content={content as ReverseMessageContent} />;
    case "first_letters":
      return <FirstLetters content={content as FirstLettersContent} />;
    case "keyboard_shift":
      return <KeyboardShift content={content as KeyboardShiftContent} />;
    case "missing_vowels":
      return <MissingVowels content={content as MissingVowelsContent} />;
    case "morse_code":
      return <MorseCode content={content as MorseCodeContent} />;
    case "letter_math":
      return <LetterMath content={content as LetterMathContent} />;
    case "word_chain":
      return <WordChain content={content as WordChainContent} />;
    default:
      return <p className="puzzle-unknown">Unknown puzzle type</p>;
  }
}

// ---------------------------------------------------------------------------
// Per-type renderers
// ---------------------------------------------------------------------------

function CaesarCipher({ content }: { content: CaesarCipherContent }) {
  return (
    <div className="puzzle-block">
      <p className="puzzle-cipher-text">{content.text}</p>
      <div className="puzzle-meta">
        <span className="puzzle-meta-label">Shift</span>
        <span className="puzzle-meta-value">{content.shift}</span>
      </div>
    </div>
  );
}

function NumberCode({ content }: { content: NumberCodeContent }) {
  return (
    <div className="puzzle-block">
      <div className="puzzle-number-row">
        {content.numbers.map((n, i) => (
          <span key={i} className="puzzle-number-tile">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function Anagram({ content }: { content: AnagramContent }) {
  return (
    <div className="puzzle-block">
      <div className="puzzle-letter-row">
        {content.letters.split("").map((ch, i) => (
          <span key={i} className="puzzle-letter-tile">
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReverseMessage({ content }: { content: ReverseMessageContent }) {
  return (
    <div className="puzzle-block">
      <p className="puzzle-cipher-text puzzle-reverse">{content.text}</p>
    </div>
  );
}

function FirstLetters({ content }: { content: FirstLettersContent }) {
  return (
    <div className="puzzle-block">
      <ol className="puzzle-sentence-list">
        {content.sentences.map((s, i) => (
          <li key={i} className="puzzle-sentence">
            <span className="puzzle-first-letter">{s.charAt(0)}</span>
            {s.slice(1)}
          </li>
        ))}
      </ol>
    </div>
  );
}

function KeyboardShift({ content }: { content: KeyboardShiftContent }) {
  return (
    <div className="puzzle-block">
      <p className="puzzle-cipher-text">{content.text}</p>
      <div className="puzzle-meta">
        <span className="puzzle-meta-label">Direction</span>
        <span className="puzzle-meta-value">{content.direction}</span>
        <span className="puzzle-meta-label">Positions</span>
        <span className="puzzle-meta-value">{content.positions}</span>
      </div>
    </div>
  );
}

function MissingVowels({ content }: { content: MissingVowelsContent }) {
  return (
    <div className="puzzle-block">
      <p className="puzzle-cipher-text puzzle-missing-vowels">{content.text}</p>
    </div>
  );
}

function MorseCode({ content }: { content: MorseCodeContent }) {
  // Split by letter separations (multiple spaces or slashes)
  const letters = content.code.split(/\s{2,}|\s*\/\s*/);
  return (
    <div className="puzzle-block">
      <div className="puzzle-morse-row">
        {letters.map((letter, i) => (
          <span key={i} className="puzzle-morse-letter">
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}

function LetterMath({ content }: { content: LetterMathContent }) {
  return (
    <div className="puzzle-block">
      <ul className="puzzle-equation-list">
        {content.equations.map((eq, i) => (
          <li key={i} className="puzzle-equation">
            {eq}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WordChain({ content }: { content: WordChainContent }) {
  return (
    <div className="puzzle-block">
      <ol className="puzzle-clue-list">
        {content.clues.map((clue, i) => (
          <li key={i} className="puzzle-clue">
            {clue}
          </li>
        ))}
      </ol>
    </div>
  );
}
