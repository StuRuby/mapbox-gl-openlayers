import json from 'rollup-plugin-json';
import typescript from "rollup-plugin-typescript";
import commonjs from '@rollup/plugin-commonjs';
import {
    terser
} from 'rollup-plugin-terser';

export default {
    input: 'src/index.ts',
    output: {
        file: 'dist/custom-tile-layer.js',
        format: 'umd',
        name: 'CustomTileLayer'
    },
    plugins: [
        json(),
        commonjs(),
        typescript({
            exclude: 'node_modules/**',
            typescript: require('typescript')
        }),
        terser()
    ]
}