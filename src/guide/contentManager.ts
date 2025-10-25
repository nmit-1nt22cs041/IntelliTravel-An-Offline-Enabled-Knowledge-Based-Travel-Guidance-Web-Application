import * as vscode from 'vscode';

export class ContentManager {
    constructor(
        private context: vscode.ExtensionContext,
        private databaseManager: any
    ) {}

    public initialize(): void {
        console.log('Content manager initialized');
    }
}