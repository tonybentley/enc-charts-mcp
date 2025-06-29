declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(filename: string);
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }

  export interface StatementSync {
    all(...params: any[]): any[];
    get(...params: any[]): any | undefined;
    run(...params: any[]): { changes: number; lastInsertRowid: number };
  }
}