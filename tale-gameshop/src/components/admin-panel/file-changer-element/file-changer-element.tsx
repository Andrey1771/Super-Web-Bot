import React, {useState} from 'react';
import container from "../../../inversify.config";
import type {IApiClient} from "../../../iterfaces/i-api-client";
import IDENTIFIERS from "../../../constants/identifiers";
import {useDispatch, useSelector} from "react-redux";
import {Form} from "../../../store";

const FileChangerElement: React.FC = () => {
    const form = useSelector((state: { form: Form }) => state.form);//TODO
    const dispatch = useDispatch();

    const [file, setFile] = useState<File | null>(null);

    const uploadImage = async () => {
        if (!file) return form.imagePath;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.post('https://localhost:7117/api/image/upload', formData, {
                headers: {'Content-Type': 'multipart/form-data'},
            });
            return getFilePath(response.data.filePath);
        } catch (error) {
            console.error('\n' +
                'Error loading image:', error);
            return form.imagePath;
        }
    };

    const getFilePath = (fullPath: string) => {
        const fileName = fullPath.split('\\').pop();
        const newPath = `wwwroot\\uploads\\${fileName}`;
        return newPath;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            dispatch({
                type: "SET_GAME_TYPE_FORM", payload: {
                    ...form,
                    imagePath: e?.target?.files?.[0]?.name ?? ""
                }
            });
        }
    };

    return (
        <div>
            <input
                type="file"
                onChange={handleFileChange}
                className="w-full p-2 border rounded"
            />

            {form.imagePath && (
                <p className="mt-2 text-gray-600">
                    Current file: {form.imagePath.split('\\').pop()}
                </p>
            )}

            <button
                type="button"
                onClick={() => dispatch({
                    type: "SET_GAME_TYPE_FORM", payload: {
                        ...form,
                        imagePath: ''
                    }
                })}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 mt-2"
            >
                Clear File
            </button>
        </div>
    );
};

export default FileChangerElement;
