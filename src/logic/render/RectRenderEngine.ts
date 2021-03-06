import {IPoint} from "../../interfaces/IPoint";
import {IRect} from "../../interfaces/IRect";
import {RectUtil} from "../../utils/RectUtil";
import {DrawUtil} from "../../utils/DrawUtil";
import {store} from "../..";
import {ImageData, LabelRect} from "../../store/editor/types";
import uuidv1 from 'uuid/v1';
import {
    updateActiveLabelId,
    updateFirstLabelCreatedFlag,
    updateHighlightedLabelId,
    updateImageDataById
} from "../../store/editor/actionCreators";
import {PointUtil} from "../../utils/PointUtil";
import {RectAnchor} from "../../data/RectAnchor";
import {RenderEngineConfig} from "../../settings/RenderEngineConfig";
import {CanvasUtil} from "../../utils/CanvasUtil";
import {updateCustomcursorStyle} from "../../store/general/actionCreators";
import {CustomCursorStyle} from "../../data/CustomCursorStyle";
import {EditorSelector} from "../../store/selectors/EditorSelector";
import {EditorData} from "../../data/EditorData";
import {BaseRenderEngine} from "./BaseRenderEngine";

export class RectRenderEngine extends BaseRenderEngine {
    private config: RenderEngineConfig = new RenderEngineConfig();

    // =================================================================================================================
    // STATE
    // =================================================================================================================

    private startCreateRectPoint: IPoint;
    private startResizeRectAnchor: RectAnchor;

    public constructor(canvas: HTMLCanvasElement) {
        super(canvas);
    }

    // =================================================================================================================
    // EVENT HANDLERS
    // =================================================================================================================

    public mouseDownHandler = (data: EditorData) => {
        const isMouseOverImage: boolean = RectUtil.isPointInside(data.activeImageRectOnCanvas,
            data.mousePositionOnCanvas);
        const isMouseOverCanvas: boolean = RectUtil.isPointInside({x: 0, y: 0, ...CanvasUtil.getSize(this.canvas)},
            data.mousePositionOnCanvas);

        if (isMouseOverCanvas) {
            const rectUnderMouse: LabelRect = this.getRectUnderMouse(data.activeImageScale, data.activeImageRectOnCanvas, data.mousePositionOnCanvas);
            if (!!rectUnderMouse) {
                const rect: IRect = this.calculateRectRelativeToActiveImage(rectUnderMouse.rect, data.activeImageScale);
                const anchorUnderMouse: RectAnchor = this.getAnchorUnderMouseByRect(rect, data.mousePositionOnCanvas, data.activeImageRectOnCanvas);
                if (!!anchorUnderMouse) {
                    store.dispatch(updateActiveLabelId(rectUnderMouse.id));
                    this.startRectResize(anchorUnderMouse);
                } else {
                    this.startRectCreation(data.mousePositionOnCanvas);
                }
            } else if (isMouseOverImage) {
                this.startRectCreation(data.mousePositionOnCanvas);
            }
        }
    };

    public mouseUpHandler = (data: EditorData) => {
        if (!!data.activeImageRectOnCanvas) {
            const mousePositionSnapped: IPoint = RectUtil.snapPointToRect(data.mousePositionOnCanvas, data.activeImageRectOnCanvas);

            if (!!this.startCreateRectPoint && !PointUtil.equals(this.startCreateRectPoint, mousePositionSnapped)) {

                const minX: number = Math.min(this.startCreateRectPoint.x, mousePositionSnapped.x);
                const minY: number = Math.min(this.startCreateRectPoint.y, mousePositionSnapped.y);
                const maxX: number = Math.max(this.startCreateRectPoint.x, mousePositionSnapped.x);
                const maxY: number = Math.max(this.startCreateRectPoint.y, mousePositionSnapped.y);

                const rect: IRect = {
                    x: (minX - data.activeImageRectOnCanvas.x) * data.activeImageScale,
                    y: (minY - data.activeImageRectOnCanvas.y) * data.activeImageScale,
                    width: (maxX - minX) * data.activeImageScale,
                    height: (maxY - minY) * data.activeImageScale
                };
                this.addRectLabel(rect);
            }

            if (!!this.startResizeRectAnchor) {
                const activeLabelRect: LabelRect = EditorSelector.getActiveRectLabel();
                const rect: IRect = this.calculateRectRelativeToActiveImage(activeLabelRect.rect, data.activeImageScale);
                const startAnchorPosition: IPoint = PointUtil.add(this.startResizeRectAnchor.position,
                    data.activeImageRectOnCanvas);
                const delta: IPoint = PointUtil.subtract(mousePositionSnapped, startAnchorPosition);
                const resizeRect: IRect = RectUtil.resizeRect(rect, this.startResizeRectAnchor.type, delta);
                const scaledRect: IRect = RectRenderEngine.scaleRect(resizeRect, data.activeImageScale);

                const imageData = EditorSelector.getActiveImageData();
                imageData.labelRects = imageData.labelRects.map((labelRect: LabelRect) => {
                    if (labelRect.id === activeLabelRect.id) {
                        return {
                            ...labelRect,
                            rect: scaledRect
                        };
                    }
                    return labelRect;
                });
                store.dispatch(updateImageDataById(imageData.id, imageData));
            }
        }
        this.endRectTransformation()
    };

    public mouseMoveHandler = (data: EditorData) => {
        if (!!data.activeImageRectOnCanvas) {
            const isOverImage: boolean = RectUtil.isPointInside(data.activeImageRectOnCanvas, data.mousePositionOnCanvas);
            if (isOverImage && !this.startResizeRectAnchor) {
                const labelRect: LabelRect = this.getRectUnderMouse(data.activeImageScale, data.activeImageRectOnCanvas, data.mousePositionOnCanvas);
                if (!!labelRect) {
                    if (store.getState().editor.highlightedLabelId !== labelRect.id) {
                        store.dispatch(updateHighlightedLabelId(labelRect.id))
                    }
                } else {
                    if (store.getState().editor.highlightedLabelId !== null) {
                        store.dispatch(updateHighlightedLabelId(null))
                    }
                }
            }
        }
    };

    // =================================================================================================================
    // RENDERING
    // =================================================================================================================

    public render(data: EditorData) {
        const activeLabelId: string = store.getState().editor.activeLabelId;
        const imageData: ImageData = EditorSelector.getActiveImageData();

        if (imageData) {
            imageData.labelRects.forEach((labelRect: LabelRect) => {
                labelRect.id === activeLabelId ? this.drawActiveRect(labelRect, data.mousePositionOnCanvas, data.activeImageRectOnCanvas, data.activeImageScale) : this.drawInactiveRect(labelRect, data.activeImageScale, data.activeImageRectOnCanvas);
            });
            this.drawCurrentlyCreatedRect(data.mousePositionOnCanvas, data.activeImageRectOnCanvas);
            this.updateCursorStyle(data);
        }
    }

    private drawCurrentlyCreatedRect(mousePosition: IPoint, imageRect: IRect) {
        if (!!this.startCreateRectPoint) {
            const mousePositionSnapped: IPoint = RectUtil.snapPointToRect(mousePosition, imageRect);
            const activeRect: IRect = {
                x: this.startCreateRectPoint.x,
                y: this.startCreateRectPoint.y,
                width: mousePositionSnapped.x - this.startCreateRectPoint.x,
                height: mousePositionSnapped.y - this.startCreateRectPoint.y
            };
            const activeRectBetweenPixels = DrawUtil.setRectBetweenPixels(activeRect);
            DrawUtil.drawRect(this.canvas, activeRectBetweenPixels, this.config.rectActiveColor, this.config.rectThickness);
        }
    }

    private drawInactiveRect(labelRect: LabelRect, scale: number, imageRect: IRect) {
        const rectOnImage: IRect = this.transferRectToImage(labelRect.rect, scale, imageRect);
        const highlightedLabelId: string = store.getState().editor.highlightedLabelId;
        this.renderRect(rectOnImage, labelRect.id === highlightedLabelId);
    }

    private drawActiveRect(labelRect: LabelRect, mousePosition: IPoint, imageRect: IRect, scale: number) {
        let rect: IRect = this.calculateRectRelativeToActiveImage(labelRect.rect, scale);
        if (!!this.startResizeRectAnchor) {
            const startAnchorPosition: IPoint = PointUtil.add(this.startResizeRectAnchor.position, imageRect);
            const endAnchorPositionSnapped: IPoint = RectUtil.snapPointToRect(mousePosition, imageRect);
            const delta = PointUtil.subtract(endAnchorPositionSnapped, startAnchorPosition);
            rect = RectUtil.resizeRect(rect, this.startResizeRectAnchor.type, delta);
        }
        const rectOnImage: IRect = RectUtil.translate(rect, imageRect);
        this.renderRect(rectOnImage, true);
    }

    private renderRect(rectOnImage: IRect, isActive: boolean) {
        const rectBetweenPixels = DrawUtil.setRectBetweenPixels(rectOnImage);
        const lineColor: string = isActive ? this.config.rectActiveColor : this.config.rectInactiveColor;
        DrawUtil.drawRect(this.canvas, rectBetweenPixels, lineColor, this.config.rectThickness);
        if (isActive) {
            const handleCenters: IPoint[] = RectUtil.mapRectToAnchors(rectOnImage).map((rectAnchor: RectAnchor) => rectAnchor.position);
            handleCenters.forEach((center: IPoint) => {
                const handleRect: IRect = RectUtil.getRectWithCenterAndSize(center, this.config.anchorSize);
                const handleRectBetweenPixels: IRect = DrawUtil.setRectBetweenPixels(handleRect);
                DrawUtil.drawRectWithFill(this.canvas, handleRectBetweenPixels, this.config.activeAnchorColor);
            })
        }
    }

    private updateCursorStyle(data: EditorData) {
        if (!!this.canvas && !!data.mousePositionOnCanvas) {
            const rectAnchorUnderMouse: RectAnchor = this.getAnchorUnderMouse(data.activeImageScale, data.mousePositionOnCanvas, data.activeImageRectOnCanvas);
            if (!!rectAnchorUnderMouse || !!this.startResizeRectAnchor) {
                store.dispatch(updateCustomcursorStyle(CustomCursorStyle.MOVE));
                return;
            }
            if (RectUtil.isPointInside({x: 0, y: 0, ...CanvasUtil.getSize(this.canvas)}, data.mousePositionOnCanvas)) {
                if (!RectUtil.isPointInside(data.activeImageRectOnCanvas, data.mousePositionOnCanvas) && !!this.startCreateRectPoint)
                    store.dispatch(updateCustomcursorStyle(CustomCursorStyle.MOVE));
                else
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
        return !!this.startCreateRectPoint || !!this.startResizeRectAnchor;
    }

    private static scaleRect(inputRect:IRect, scale: number): IRect {
        return {
            x: inputRect.x * scale,
            y: inputRect.y * scale,
            width: inputRect.width * scale,
            height: inputRect.height * scale
        }
    }

    private calculateRectRelativeToActiveImage(rect: IRect, scale: number):IRect {
        return RectRenderEngine.scaleRect(rect, 1/scale);
    }

    private addRectLabel = (rect: IRect) => {
        const activeImageIndex = store.getState().editor.activeImageIndex;
        const activeLabelIndex = store.getState().editor.activeLabelNameIndex;
        const imageData: ImageData = store.getState().editor.imagesData[activeImageIndex];
        const labelRect: LabelRect = {
            id: uuidv1(),
            labelIndex: activeLabelIndex,
            rect
        };
        imageData.labelRects.push(labelRect);
        store.dispatch(updateImageDataById(imageData.id, imageData));
        store.dispatch(updateFirstLabelCreatedFlag(true));
        store.dispatch(updateActiveLabelId(labelRect.id));
    };

    private getRectUnderMouse(scale: number, imageRect: IRect, mousePosition: IPoint): LabelRect {
        const activeRectLabel: LabelRect = EditorSelector.getActiveRectLabel();
        if (!!activeRectLabel && this.isMouseOverRectEdges(activeRectLabel.rect, scale, imageRect, mousePosition)) {
            return activeRectLabel;
        }

        const labelRects: LabelRect[] = EditorSelector.getActiveImageData().labelRects;
        for (let i = 0; i < labelRects.length; i++) {
            if (this.isMouseOverRectEdges(labelRects[i].rect, scale, imageRect, mousePosition)) {
                return labelRects[i];
            }
        }
        return null;
    }

    private isMouseOverRectEdges(rect: IRect, scale: number, imageRect: IRect, mousePosition: IPoint): boolean {
        const rectOnImage: IRect = RectUtil.translate(
            this.calculateRectRelativeToActiveImage(rect, scale), imageRect);

        const outerRectDelta: IPoint = {
            x: this.config.anchorHoverSize.width / 2,
            y: this.config.anchorHoverSize.height / 2
        };
        const outerRect: IRect = RectUtil.expand(rectOnImage, outerRectDelta);

        const innerRectDelta: IPoint = {
            x: - this.config.anchorHoverSize.width / 2,
            y: - this.config.anchorHoverSize.height / 2
        };
        const innerRect: IRect = RectUtil.expand(rectOnImage, innerRectDelta);

        return (RectUtil.isPointInside(outerRect, mousePosition) &&
            !RectUtil.isPointInside(innerRect, mousePosition));
    }

    private getAnchorUnderMouseByRect(rect: IRect, mousePosition: IPoint, imageRect: IRect): RectAnchor {
        const rectAnchors: RectAnchor[] = RectUtil.mapRectToAnchors(rect);
        for (let i = 0; i < rectAnchors.length; i++) {
            const anchorRect: IRect = RectUtil.translate(RectUtil.getRectWithCenterAndSize(rectAnchors[i].position, this.config.anchorHoverSize), imageRect)
            if (!!mousePosition && RectUtil.isPointInside(anchorRect, mousePosition)) {
                return rectAnchors[i];
            }
        }
        return null;
    }

    private getAnchorUnderMouse(scale: number, mousePosition: IPoint, imageRect: IRect): RectAnchor {
        const labelRects: LabelRect[] = EditorSelector.getActiveImageData().labelRects;
        for (let i = 0; i < labelRects.length; i++) {
            const rect: IRect = this.calculateRectRelativeToActiveImage(labelRects[i].rect, scale);
            const rectAnchor = this.getAnchorUnderMouseByRect(rect, mousePosition, imageRect);
            if (!!rectAnchor) return rectAnchor;
        }
        return null;
    }

    private startRectCreation(mousePosition: IPoint) {
        this.startCreateRectPoint = mousePosition;
        store.dispatch(updateActiveLabelId(null));
    }

    private startRectResize(activatedAnchor: RectAnchor) {
        this.startResizeRectAnchor = activatedAnchor;
    }

    private endRectTransformation() {
        this.startCreateRectPoint = null;
        this.startResizeRectAnchor = null;
    }

    private transferRectToImage(rect:IRect, scale: number, imageRect: IRect): IRect {
        const scaledRect = RectRenderEngine.scaleRect(rect, 1/scale);
        return {
            ...scaledRect,
            x: scaledRect.x + imageRect.x,
            y: scaledRect.y + imageRect.y
        }
    }
}