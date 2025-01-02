import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import path from 'path';
import fs from 'fs';

// Чтение сертификатов для HTTPS
const cert = fs.readFileSync('./public/private.crt');
const key = fs.readFileSync('./public/private.key');

// Определяем режим (dev или prod) через переменную окружения
const isProduction = process.env.NODE_ENV === 'production';

export default {
    mode: isProduction ? 'production' : 'development', // Устанавливаем режим
    optimization: {
        minimize: isProduction, // Минификация в продакшн-режиме
    },
    entry: './src/index.tsx', // Точка входа для React-компонентов
    output: {
        path: path.resolve(import.meta.url, 'dist'),
        filename: isProduction ? 'bundle.[contenthash].js' : 'bundle.js', // Разные имена для продакшн
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
                use: [
                    isProduction ? MiniCssExtractPlugin.loader : 'style-loader', // Разные загрузчики для dev и prod
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
                            minimize: isProduction, // Минификация HTML в продакшн
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
        ...(isProduction
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
    devtool: isProduction ? 'source-map' : 'cheap-module-source-map', // Разные карты исходников для разных режимов
};