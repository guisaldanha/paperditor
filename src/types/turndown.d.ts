declare module 'turndown' {
  interface TurndownServiceOptions {
    headingStyle?: 'atx' | 'setext';
    codeBlockStyle?: 'fenced' | 'indented';
    bulletListMarker?: '-' | '*' | '+';
    strongDelimiter?: '*' | '_';
    emDelimiter?: '*' | '_';
  }

  class TurndownService {
    constructor(options?: TurndownServiceOptions);
    turndown(html: string): string;
  }

  export default TurndownService;
}