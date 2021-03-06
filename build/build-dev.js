import json from 'rollup-plugin-json';
import typescript from "rollup-plugin-typescript";
import commonjs from '@rollup/plugin-commonjs';
import resolve from 'rollup-plugin-node-resolve';

export default {
    input: 'src/index.ts',
    output: {
        file: 'dist/custom-tile-layer.js',
        format: 'esm',
        name: 'CustomTileLayer'
    },
    plugins: [
        json(),
        commonjs(),
        // resolve(),
        typescript({
            exclude: 'node_modules/**',
            typescript: require('typescript')
        }),
    ]
}