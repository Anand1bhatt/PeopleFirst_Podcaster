declare module "@postlight/mercury-parser" {
  type ParseResult = {
    title?: string;
    content?: string;
  };
  const Mercury: {
    parse(
      url: string,
      options?: { contentType?: string; headers?: Record<string, string> }
    ): Promise<ParseResult>;
  };
  export default Mercury;
}
