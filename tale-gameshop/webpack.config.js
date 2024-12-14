import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

import path from 'path';

export default {
    mode: 'development',
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
                    'babel-loader',
                    {
                        loader: 'ts-loader',
                        options: {
                            transpileOnly: true,
                            experimentalWatchApi: true
                        }
                    }
                ],
                exclude: /node_modules/
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
            },
            {
                test: /\.html$/,
                use: ['html-loader'],
            }
        ],
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: './public/index.html',
        }),
        new MiniCssExtractPlugin({
            filename: 'styles.css',
        })
    ],
    devServer: {
        historyApiFallback: true,
        compress: true,
        port: 3000,
        server: 'https',
    },
    devtool: 'source-map',
};