import {store} from "../../index";
import {RectUtil} from "../../utils/RectUtil";
import {updateCustomcursorStyle} from "../../store/general/actionCreators";
import {CustomCursorStyle} from "../../data/CustomCursorStyle";
import {EditorData} from "../../data/EditorData";
import {BaseRenderEngine} from "./BaseRenderEngine";

export class PolygonRenderEngine extends BaseRenderEngine {

    public constructor(canvas: HTMLCanvasElement) {
        super(canvas);
    }

    // =================================================================================================================
    // EVENT HANDLERS
    // =================================================================================================================

    public mouseDownHandler(data: EditorData): void {}

    public mouseUpHandler(data: EditorData): void {}

    public mouseMoveHandler(data: EditorData): void {}

    // =================================================================================================================
    // RENDERING
    // =================================================================================================================

    public render(data: EditorData): void {
        this.updateCursorStyle(data);
    }

    private updateCursorStyle(data: EditorData) {
        if (!!this.canvas && !!data.mousePositionOnCanvas) {
            if (RectUtil.isPointInside(data.activeImageRectOnCanvas, data.mousePositionOnCanvas)) {
                store.dispatch(updateCustomcursorStyle(CustomCursorStyle.DEFAULT));
                this.canvas.style.cursor = "none";
            } else {
                this.canvas.style.cursor = "default";
            }
        }
    }

    // =================================================================================================================
    // HELPERS
    // =================================================================================================================

    public isInProgress(): boolean {
        return false;
    }
}