import React, { useEffect, useRef, useState } from 'react';
import container from "../../../inversify.config";
import IDENTIFIERS from "../../../constants/identifiers";
import type { IApiClient } from "../../../iterfaces/i-api-client";

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

const BotChangerPage: React.FC = () => {
    const [editableData, setEditableData] = useState<Data>({
        keyboardKeys: {},
        translations: {}
    });
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'translations' | 'keyboardKeys'>('translations'); // Для переключения между компонентами

    // Ссылки на все текстовые поля для динамической подстройки высоты
    const textAreaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
                const response = (await apiClient.api.get<Data>('/api/Admin')).data;
                setEditableData(response);
            } catch (error) {
                console.error('Error getting data:', error);
            }
        })();
    }, []);

    // Функция для обновления высоты всех текстовых полей
    const updateTextAreaHeight = () => {
        textAreaRefs.current.forEach((textarea) => {
            if (textarea) {
                textarea.style.height = 'auto';
                textarea.style.height = `${textarea.scrollHeight}px`;
            }
        });
    };

    useEffect(() => {
        updateTextAreaHeight();
    }, [editableData, view]);

    const handleInputChange = (key: string, value: string) => {
        setEditableData((prevData) => {
            if (view === 'translations') {
                return {
                    ...prevData,
                    translations: {
                        ...prevData.translations,
                        ru: {
                            ...prevData.translations.ru,
                            [key]: value,
                        },
                    },
                };
            } else if (view === 'keyboardKeys') {
                return {
                    ...prevData,
                    keyboardKeys: {
                        ...prevData.keyboardKeys,
                        [key]: value,
                    },
                };
            }
            return prevData;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.post('/api/Admin', editableData);
            console.log('Server response:', response.data);
        } catch (err) {
            console.error('Error sending data:', err);
            setError('Error sending data to the server.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gray-100">
            <div className="w-full max-w-4xl bg-white p-8 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-6 text-center">Edit Bot Data</h2>

                {/* Переключение между отображениями */}
                <div className="flex justify-center mb-6">
                    <button
                        onClick={() => setView('translations')}
                        className={`py-2 px-4 mx-2 ${view === 'translations' ? 'bg-green-500 text-white' : 'bg-gray-300'} rounded-md focus:outline-none`}
                    >
                        Translations
                    </button>
                    <button
                        onClick={() => setView('keyboardKeys')}
                        className={`py-2 px-4 mx-2 ${view === 'keyboardKeys' ? 'bg-green-500 text-white' : 'bg-gray-300'} rounded-md focus:outline-none`}
                    >
                        Keyboard Keys
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div>
                        <h3 className="text-xl font-semibold mb-4">{view === 'translations' ? 'Editable Translations:' : 'Editable Keyboard Keys:'}</h3>
                        {editableData && editableData[view] ? (
                            Object.entries((view === 'translations' ? editableData[view].ru : editableData[view]) ?? {}).map(([key, value], index) => (
                                <div key={key} className="mb-4">
                                    <label htmlFor={key} className="block text-sm font-semibold mb-2">
                                        {key}
                                    </label>
                                    <textarea
                                        ref={(el) => (textAreaRefs.current[index] = el)}
                                        id={key}
                                        value={value}
                                        onChange={(e) => {
                                            handleInputChange(key, e.target.value);
                                            updateTextAreaHeight();
                                        }}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-400 resize-y"
                                        style={{ minHeight: '40px', overflow: 'hidden' }}
                                    />
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8">Loading data...</div>
                        )}
                    </div>
                    <button
                        type="submit"
                        className="w-full mt-6 py-3 px-6 bg-green-500 text-white font-semibold rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400"
                        disabled={loading}
                    >
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                    {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
                </form>
            </div>
        </div>
    );
};

export default BotChangerPage;