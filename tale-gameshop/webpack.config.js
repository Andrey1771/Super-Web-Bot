import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

import path from 'path';

import fs from 'fs';
const cert = fs.readFileSync('./public/private.crt');
const key = fs.readFileSync('./public/private.key');

export default {
    mode: 'development',
    optimization: {
        minimize: false, // Отключить минификацию
    },
    entry: './src/index.tsx', // Точка входа для React-компонентов
    output: {
        path: path.resolve(import.meta.url, 'dist'),
        filename: 'bundle.js',
        publicPath: '/', // или другой путь
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            presets: [],
                            plugins: [],
                        },
                    },
                    {
                        loader: 'ts-loader',
                        options: {
                            transpileOnly: true,
                            experimentalWatchApi: true,
                        },
                    },
                ],
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
            },
            {
                test: /\.html$/,
                use: [
                    {
                        loader: 'html-loader',
                        options: {
                            sources: false,
                            minimize: false,
                        },
                    },
                ],
            },
        ],
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: './public/index.html',
        }),
        new MiniCssExtractPlugin({
            filename: 'styles.css',
        }),
    ],
    devServer: {
        historyApiFallback: true,
        compress: false,
        port: 3000,
        server: {
            type: 'https',
            options: {
                key: key,
                cert: cert,
                passphrase: 'webpack-dev-server',
                requestCert: false,
            },
        },
    },
    devtool: 'source-map', // Включить карты исходников
};