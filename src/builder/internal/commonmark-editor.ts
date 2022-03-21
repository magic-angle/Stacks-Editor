import { Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { log } from "../../shared/logger";
import { editableCheck } from "../../shared/prosemirror-plugins/readonly";
import { CodeStringParser, commonmarkSchema } from "../../shared/schema";
import { BaseView } from "../../shared/view";
import { AggregatedEditorPlugin, BaseOptions } from "../types";

export class CommonmarkEditor<TOptions extends BaseOptions> extends BaseView {
    constructor(
        target: Element,
        content: string,
        plugin: AggregatedEditorPlugin<TOptions>
    ) {
        super();

        this.editorView = new EditorView(
            (node: HTMLElement) => {
                node.classList.add(...plugin.options.classList);
                target.appendChild(node);
            },
            {
                editable: editableCheck,
                state: EditorState.create({
                    doc: this.parseContent(content),
                    plugins: [...plugin.commonmark(plugin.options).plugins],
                }),
            }
        );

        log(
            "prosemirror commonmark document",
            this.editorView.state.doc.toJSON()
        );
    }

    parseContent(content: string): Node {
        return CodeStringParser.fromSchema(commonmarkSchema).parseCode(content);
    }

    serializeContent(): string {
        return CodeStringParser.toString(this.editorView.state.doc);
    }
}
