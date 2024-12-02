import React, {useEffect, useRef, useState} from 'react';
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type {IApiClient} from "../../iterfaces/i-api-client";
type Translations = {
    [key: string]: string;
};

type Data = {
    keyboardKeys: {
        [key: string]: string;
    };
    translations: {
        [key: string]: Translations;
    };
};

type EditableDataProps = {
    data: Data;
    onSubmit: (updatedData: Data) => void;
};

const AdminPanelPage: React.FC = () => {
    let response: Data = {
        keyboardKeys: {},
        translations: {}
    };
    const [editableData, setEditableData] = useState<Data>(response);

    // Ссылки на все текстовые поля для динамической подстройки высоты
    const textAreaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
                response = (await apiClient.api.get<Data>('https://localhost:7117/api/Admin')).data;
                setEditableData(response);
                console.log(response);
            } catch (error) {
                console.error('Error getting data:', error);
            }
        })();
    }, []);

    // Функция для обновления высоты всех текстовых полей
    const updateTextAreaHeight = () => {
        textAreaRefs.current.forEach((textarea) => {
            if (textarea) {
                // Сбрасываем высоту, чтобы вычислить новую
                textarea.style.height = 'auto';
                // Устанавливаем высоту под содержимое
                textarea.style.height = `${textarea.scrollHeight}px`;
            }
        });
    };

    useEffect(() => {
        // Вызываем updateTextAreaHeight после первого рендера
        updateTextAreaHeight();
    }, [editableData]); // Следим за изменениями данных

    const handleInputChange = (key: string, value: string) => {
        setEditableData((prevData) => ({
            ...prevData,
            translations: {
                ...prevData.translations,
                ru: {
                    ...prevData.translations.ru,
                    [key]: value,
                },
            },
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // onSubmit(editableData); // Call the function to submit updated data
    };

    return (
        <div className="flex items-center justify-center min-h-screen p-8">
            <div className="w-full max-w-4xl bg-white p-8 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-6 text-center">Edit Bot Translation Data</h2>
                <form onSubmit={handleSubmit}>
                    <div>
                        <h3 className="text-xl font-semibold mb-4">Editable Values:</h3>
                        {editableData.translations.ru ? (
                            Object.entries(editableData.translations.ru).map(([key, value], index) => (
                                <div key={key} className="mb-4">
                                    <label htmlFor={key} className="block text-sm font-semibold mb-2">
                                        {key}
                                    </label>
                                    <textarea
                                        ref={(el) => textAreaRefs.current[index] = el} // Сохраняем ссылку на каждое поле
                                        id={key}
                                        value={value}
                                        onChange={(e) => handleInputChange(key, e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-400 resize-y" // Разрешаем растягивать по вертикали
                                        style={{ minHeight: '40px', overflow: 'hidden' }} // Минимальная высота и скрытие прокрутки
                                    />
                                </div>
                            ))
                        ) : (
                            <p>Loading data...</p>
                        )}
                    </div>
                    <button
                        type="submit"
                        className="w-full mt-6 py-3 px-6 bg-green-500 text-white font-semibold rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400"
                    >
                        Save Changes
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminPanelPage;