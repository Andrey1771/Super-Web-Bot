import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Чтение сертификатов для HTTPS
const cert = fs.readFileSync('./public/private.crt');
const key = fs.readFileSync('./public/private.key');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default (env, { mode }) => ({
    mode: mode === 'production' ? 'production' : 'development',
    optimization: {
        minimize: mode === 'production',
    },
    entry: './src/index.tsx', // Точка входа для React-компонентов
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: (mode === 'production') ? 'bundle.[contenthash].js' : 'bundle.js', // Разные имена для продакшн
        publicPath: '/',
        assetModuleFilename: 'images/[hash][ext][query]'
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
                use: [
                    (mode === 'production') ? MiniCssExtractPlugin.loader : 'style-loader',
                    'css-loader',
                    'postcss-loader',
                ],
            },
            {
                test: /\.html$/,
                use: [
                    {
                        loader: 'html-loader',
                        options: {
                            sources: false,
                            minimize: (mode === 'production'), // Минификация HTML в продакшн
                        },
                    },
                ],
            },
            {
                test: /\.(png|jpe?g|gif|svg|ico|webp)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/images/[name].[contenthash][ext]', // Настроим хэширование картинок
                },
                include: path.resolve(__dirname, 'src/assets/images'), // Путь с использованием import.meta.url
            },
        ],
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: './public/index.html',
            favicon: './public/favicon.ico',
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'public/silent-check-sso.html', to: '' },
                // Копирование favicon, если нужно
                { from: 'public/favicon.ico', to: 'favicon.ico' },
            ],
        }),
        ...((mode === 'production')
            ? [
                new MiniCssExtractPlugin({
                    filename: 'styles.[contenthash].css', // Добавляем хеши в продакшн-режиме
                }),
            ]
            : []), // В dev не нужен MiniCssExtractPlugin
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
    devtool: (mode === 'production') ? 'source-map' : 'cheap-module-source-map', // Разные карты исходников для разных режимов
});
