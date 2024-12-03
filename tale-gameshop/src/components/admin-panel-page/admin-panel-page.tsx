import React, { useEffect, useRef, useState } from 'react';
import container from "../../inversify.config";
import IDENTIFIERS from "../../constants/identifiers";
import type { IApiClient } from "../../iterfaces/i-api-client";

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
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // References to all text areas for dynamic height adjustment
    const textAreaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
                response = (await apiClient.api.get<Data>('https://localhost:7117/api/Admin')).data;
                setEditableData(response);
            } catch (error) {
                console.error('Error getting data:', error);
            }
        })();
    }, []);

    // Function to update the height of all text areas
    const updateTextAreaHeight = () => {
        textAreaRefs.current.forEach((textarea) => {
            if (textarea) {
                // Reset the height to calculate the new one
                textarea.style.height = 'auto';
                // Set the height based on content
                textarea.style.height = `${textarea.scrollHeight}px`;
            }
        });
    };

    useEffect(() => {
        // Call updateTextAreaHeight after the first render
        updateTextAreaHeight();
    }, [editableData]); // Watch for data changes

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Set loading status
        setLoading(true);
        setError(null);

        try {
            const apiClient = container.get<IApiClient>(IDENTIFIERS.IApiClient);
            const response = await apiClient.api.post('https://localhost:7117/api/Admin', editableData);
            console.log('Server response:', response.data);
        } catch (err) {
            console.error('Error sending data:', err);
            setError('Error sending data to the server.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-gray-100">
            <div className="w-full max-w-4xl bg-white p-8 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold mb-6 text-center">Edit Bot Translation Data</h2>
                <form onSubmit={handleSubmit}>
                    <div>
                        <h3 className="text-xl font-semibold mb-4">Editable Values:</h3>
                        {editableData && editableData.translations && editableData.translations.ru ? (
                            Object.entries(editableData.translations.ru).map(([key, value], index) => (
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

export default AdminPanelPage;