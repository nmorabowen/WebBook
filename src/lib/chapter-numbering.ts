type ChapterNumberNode = {
  path: string[];
  children: ChapterNumberNode[];
};

function chapterPathKey(chapterPath: string[]) {
  return chapterPath.join("/");
}

export function nestedChapterNumber(parentNumber: string, siblingIndex: number) {
  const segment = String(siblingIndex + 1);
  return parentNumber ? `${parentNumber}.${segment}` : segment;
}

export function buildChapterNumberIndex(chapters: ChapterNumberNode[]) {
  const numbers = new Map<string, string>();

  const walk = (items: ChapterNumberNode[], parentNumber: string) => {
    items.forEach((chapter, index) => {
      const chapterNumber = nestedChapterNumber(parentNumber, index);
      numbers.set(chapterPathKey(chapter.path), chapterNumber);
      walk(chapter.children, chapterNumber);
    });
  };

  walk(chapters, "");
  return numbers;
}

export function getChapterNumberByPath(
  chapters: ChapterNumberNode[],
  chapterPath: string[],
) {
  if (!chapterPath.length) {
    return null;
  }

  return buildChapterNumberIndex(chapters).get(chapterPathKey(chapterPath)) ?? null;
}

