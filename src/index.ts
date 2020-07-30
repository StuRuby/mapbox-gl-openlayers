import { Map, CustomLayerInterface, MercatorCoordinate } from 'mapbox-gl';
import * as ol from 'ol';


export default class CustomTileLayer {
    width: number;
    height: number;
    tileOptions: TileOptions;
    id: string;
    olMap: ol.Map;
    layer: CustomLayerInterface;
    map: Map;
    constructor(type: LayerType, options: Options) {
        const { id, width, height, tileOptions } = options;
        this.id = id;
        this.width = width;
        this.height = height;
        this.tileOptions = tileOptions;

        this.olMap = this.createOlMap(type);
        this.layer = this.createCustomWMTSLayer();
    }

    createOlMap(type: LayerType) {
        const self = this;
        const width = this.width;
        const height = this.height;
        const container = document.createElement('div');
        const map = new ol.Map({
            target: container,
            view: new ol.View({
                projection: 'EPSG:3857',
                center: [0, 0],
                zoom: 10,
            })
        });
        map.interactions.clear();
        map.controls.clear();
        map.setSize([width, height]);
        window.removeEventListener('resize', map.handleResize_);
        let source;
        let tileGrid;
        switch (type) {
            case 'WMTS':
                tileGrid = new ol.tilegrid.WMTS(this.tileOptions.tileGrid);
                source = new ol.source.WMTS(Object.assign(this.tileOptions, { tileGrid }));
                break;
            case 'XYZ':
                tileGrid = new ol.tilegrid.WMTS(this.tileOptions.tileGrid);
                source = new ol.source.XYZ(Object.assign(this.tileOptions, { tileGrid }));
                break;
            default:
                throw new Error('暂不支持此类型服务的添加，请选择WMTS或XYZ');
        }
        const tileLayer = new ol.layer.Tile({
            source
        });
        tileLayer.on('prerender', function () {
            self.map.triggerRepaint();
        });
        map.addLayer(tileLayer);

        return map;
    }

    createCustomWMTSLayer() {
        const self = this;
        const olMap = this.olMap;

        const customWMTSLayer: CustomWMTSLayerInterface = {
            id: this.id || 'customWMTSLayer',
            type: 'custom',
            onAdd: function (map: Map, gl: WebGLRenderingContext) {
                const vertexShaderSource = `
                        attribute vec4 a_Position;
                        attribute vec2 uv;
                        uniform mat4 u_matrix;
                        varying vec2 v_uv;
                        void main (){
                            v_uv = uv;
                            gl_Position = u_matrix * a_Position;
                        }
                    `;
                const fragmentShaderSource = `
                        #ifdef GL_ES
                        precision mediump float;
                        #endif
                        varying vec2 v_uv;
                        uniform sampler2D texture;
                        void main(){
                            vec4 textureColor = texture2D(texture,v_uv);
                            gl_FragColor = textureColor;
                        }
                    `;

                this.map = map;
                this.gl = gl;

                const vertexShader = gl.createShader(gl.VERTEX_SHADER);
                this.vertexShader = vertexShader;

                // 创建顶点着色器
                gl.shaderSource(vertexShader, vertexShaderSource);
                gl.compileShader(vertexShader);
                // 获取错误信息
                if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
                    console.log(gl.getShaderInfoLog(vertexShader));
                    gl.deleteShader(vertexShader);
                    return;
                }

                // 创建片元着色器
                const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
                this.fragmentShader = fragmentShader;
                gl.shaderSource(fragmentShader, fragmentShaderSource);
                gl.compileShader(fragmentShader);
                // 获取错误信息
                if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
                    console.log(gl.getShaderInfoLog(fragmentShader));
                    gl.deleteShader(fragmentShader);
                    return;
                }

                // 创建 webgl program
                this.program = gl.createProgram();
                gl.attachShader(this.program, vertexShader);
                gl.attachShader(this.program, fragmentShader);
                gl.linkProgram(this.program);
                // 获取错误信息
                if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
                    console.log(gl.getProgramInfoLog(this.program));
                    gl.deleteProgram(this.program);
                    return;
                }

                this.matrixLocation = gl.getUniformLocation(this.program, 'u_matrix');
                this.uvPosition = gl.getAttribLocation(this.program, 'uv');
                this.texLocation = gl.getUniformLocation(this.program, 'texture');

                this.positionLocation = gl.getAttribLocation(this.program, 'a_Position');
                this.positionBuffer = gl.createBuffer();
                this.positionBufferData = new Float32Array(6 * 4);

                this.texture = gl.createTexture();
                this.uvBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
            },
            render: function (gl: WebGLRenderingContext, matrix: number[]) {
                gl.useProgram(this.program);
                const data = this.positionBufferData;

                const extent = self.getImageExtent();
                const bl = MercatorCoordinate.fromLngLat([extent[0], extent[1]]);
                const tr = MercatorCoordinate.fromLngLat([extent[2], extent[3]]);

                data[0] = bl.x;
                data[1] = tr.y;
                data[2] = 0;
                data[3] = 1;
                data[4] = bl.x;
                data[5] = bl.y;
                data[6] = 0;
                data[7] = 1;
                data[8] = tr.x;
                data[9] = tr.y;
                data[10] = 0;
                data[11] = 1;
                data[12] = tr.x;
                data[13] = tr.y;
                data[14] = 0;
                data[15] = 1;
                data[16] = bl.x;
                data[17] = bl.y;
                data[18] = 0;
                data[19] = 1;
                data[20] = tr.x;
                data[21] = bl.y;
                data[22] = 0;
                data[23] = 1;

                gl.uniformMatrix4fv(this.matrixLocation, false, matrix);

                gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, this.positionBufferData, gl.STATIC_DRAW);
                gl.enableVertexAttribArray(this.positionLocation);
                gl.vertexAttribPointer(this.positionLocation, 4, gl.FLOAT, false, 0, 0);

                gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
                gl.enableVertexAttribArray(this.uvPosition);
                gl.vertexAttribPointer(this.uvPosition, 2, gl.FLOAT, false, 0, 0);

                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.uniform1i(this.texLocation, 0);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, olMap.getTargetElement().getElementsByTagName('canvas')[0]);

                gl.enable(gl.BLEND);
                gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        }
        return customWMTSLayer;
    }

    getImageExtent() {
        const olMap = this.olMap;
        const size = [this.width, this.height];
        const extent = olMap.getView().calculateExtent(size);
        return ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
    }

    updatePosition() {
        const center = this.map.getCenter().toArray();
        const centerIn3857 = ol.proj.transform(center, 'EPSG:4326', 'EPSG:3857');
        this.olMap.getView().setCenter(centerIn3857);
        this.olMap.getView().setZoom(this.map.getZoom() + 1);
    }

    addToMap(map: Map) {
        const self = this;
        this.map = map;
        this.updatePosition();
        this.map.addLayer(this.layer);
        this.map.on('move', function () {
            self.updatePosition();
        });
        return this;
    }

    remove() {
        this.olMap.setTarget(null);
        this.map.removeLayer(this.id);
    }
}

interface Options {
    id: string;
    width: number;
    height: number;
    tileOptions: TileOptions;
}

interface CustomWMTSLayerInterface extends CustomLayerInterface {
    map: Map;
    gl: WebGLRenderingContext;
    vertexShader: WebGLShader;
    fragmentShader: WebGLShader;
    program: WebGLProgram;
    matrixLocation: WebGLUniformLocation;
    uvPosition: number;
    texLocation: WebGLUniformLocation;
    positionLocation: number;
    positionBuffer: WebGLBuffer;
    positionBufferData: Float32Array;
    texture: WebGLTexture;
    uvBuffer: WebGLBuffer;
}

type LayerType = 'WMTS' | 'XYZ';

type WMTSTileGrid = {
    origin: [number, number];
    resolutions: number[];
    matrixIds: number[];
}

type XYZTileGrid = {
    extent?: number[];
    minZoom?: number;
    origin?: number[];
    resolutions: number[];
    tileSize?: number
}

type WMTSOptions = {
    cacheSize?: number;
    crossOrigin?: string;
    tileGrid: WMTSTileGrid;
    projection?: 'EPSG:4326' | 'EPSG:3857';
    reprojectionErrorThreshold?: number;
    requestEncoding?: string;
    layer: string;
    style: string;
    tilePixelRatio?: number;
    format?: string;
    version?: string;
    matrixSet: string;
    dimensions?: any;
    url?: string;
    tileLoadFunction?: (p0: any, p1: string) => void;
    urls?: string[];
    wrapX?: boolean;
    transition?: number;
}

type XYZOptions = {
    attributionsCollapsible?: boolean;
    cacheSize?: number;
    crossOrigin?: string;
    opaque?: boolean;
    projection?: 'EPSG:4326' | 'EPSG:3857';
    reprojectionErrorThreshold?: number;
    maxZoom?: number;
    minZoom?: number;
    maxResolution?: number;
    tileGrid?: XYZTileGrid;
    tileLoadFunction?: LoadFunction;
    tilePixelRatio?: number;
    tileSize?: number | Size;
    tileUrlFunction?: (p0: any, p1: string) => void;
    url?: string;
    urls?: string[];
    wrapX?: boolean;
    transition?: number;
    zDirection?: number;
}

type TileOptions = WMTSOptions | XYZOptions;