// 本地存储相关函数
const chatStorage = {
    storageKey: 'chatHistory',
    settingsKey: 'chatSettings',
    maxMessages: 100, // 最大存储消息数

    // 保存消息到本地存储
    saveMessage(message) {
        // 检查是否启用了历史记录保存
        if (!this.getSaveHistorySetting()) {
            return;
        }

        const history = this.getHistory();
        history.push(message);
        
        // 如果超过最大数量，删除最早的消息
        while (history.length > this.maxMessages) {
            history.shift();
        }
        
        localStorage.setItem(this.storageKey, JSON.stringify(history));
    },

    // 获取历史记录
    getHistory() {
        const history = localStorage.getItem(this.storageKey);
        return history ? JSON.parse(history) : [];
    },
    

    // 获取最近的对话记录（用于连续对话）
    getRecentMessages(count = 5) {
        const history = this.getHistory();
        return history.slice(-count * 2); // 获取最近的几组对话（每组包含用户消息和AI回复）
    },

    // 清除所有历史记录
    clearHistory() {
        localStorage.removeItem(this.storageKey);
    },

    // 保存历史记录设置
    saveSaveHistorySetting(enabled) {
        const settings = this.getSettings();
        settings.saveHistory = enabled;
        this.saveSettings(settings);
    },

    // 获取历史记录设置
    getSaveHistorySetting() {
        return this.getSettings().saveHistory;
    },

    // 保存当前选择的模型
    saveSelectedModel(model) {
        const settings = this.getSettings();
        settings.selectedModel = model;
        this.saveSettings(settings);
    },

    // 获取选择的模型
    getSelectedModel() {
        return this.getSettings().selectedModel || 'openai';
    },

    // 获取所有设置
    getSettings() {
        const settings = localStorage.getItem(this.settingsKey);
        return settings ? JSON.parse(settings) : {
            saveHistory: true,
            selectedModel: 'openai'
        };
    },

    // 保存所有设置
    saveSettings(settings) {
        localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    }
};

// DOM 元素
let messageInput, sendButton, chatMessages, clearChatBtn, saveHistorySwitch, modelSelect, sendIcon, loadingIcon, emptyInputToast;

// 初始化 DOM 元素
function initDOMElements() {
    messageInput = document.getElementById('messageInput');
    sendButton = document.getElementById('sendButton');
    chatMessages = document.getElementById('chatMessages');
    clearChatBtn = document.getElementById('clearChatBtn');
    saveHistorySwitch = document.getElementById('saveHistorySwitch');
    modelSelect = document.getElementById('modelSelect');
    sendIcon = document.getElementById('sendIcon');
    loadingIcon = document.getElementById('loadingIcon');
    emptyInputToast = new bootstrap.Toast(document.getElementById('emptyInputToast'), {
        delay: 2000 // 2秒后自动关闭
    });

    // 检查必要的元素是否存在
    if (!messageInput || !sendButton || !chatMessages) {
        console.error('找不到必要的DOM元素');
        return false;
    }
    return true;
}

// 初始化事件监听
function initEventListeners() {
    // 发送按钮点击事件
    sendButton.addEventListener('click', sendMessage);

    // 清除聊天记录按钮事件
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', clearChat);
    }

    // 历史记录开关事件
    if (saveHistorySwitch) {
        saveHistorySwitch.checked = chatStorage.getSaveHistorySetting();
        saveHistorySwitch.addEventListener('change', function(e) {
            chatStorage.saveSaveHistorySetting(e.target.checked);
        });
    }

    // 模型选择变化事件
    if (modelSelect) {
        modelSelect.addEventListener('change', function(e) {
            chatStorage.saveSelectedModel(e.target.value);
        });
    }

    // 修改输入框回车事件处理
    messageInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                // Shift + Enter 时不阻止默认行为，允许换行
                return;
            } else {
                // 仅按 Enter 时发送消息
                e.preventDefault();
                sendMessage();
            }
        }
    });

    // 添加输入框高度自动调整
    messageInput.addEventListener('input', function() {
        // 重置高度
        this.style.height = 'auto';
        // 设置新高度
        this.style.height = Math.min(this.scrollHeight, 150) + 'px'; // 150px 约等于4行文本高度
    });
}

// 滚动到底部函数
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 创建消息元素
function createMessageElement(text, sender, isMarkdown = false) {
    const now = new Date();
    const timeString = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // 处理消息内容
    if (isMarkdown && sender === 'ai') {
        contentDiv.innerHTML = marked.parse(text);
        // 对新添加的代码块应用高亮和添加复制按钮
        contentDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
            
            // 创建复制按钮容器
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'code-copy-container';
            
            // 创建复制按钮
            const copyButton = document.createElement('button');
            copyButton.className = 'code-copy-btn';
            copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
            copyButton.title = '复制代码';
            
            // 添加点击事件
            copyButton.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(block.textContent);
                    copyButton.innerHTML = '<i class="bi bi-clipboard-check"></i>';
                    copyButton.classList.add('copied');
                    
                    // 2秒后恢复原始图标
                    setTimeout(() => {
                        copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
                        copyButton.classList.remove('copied');
                    }, 2000);
                } catch (err) {
                    console.error('复制失败:', err);
                    copyButton.innerHTML = '<i class="bi bi-clipboard-x"></i>';
                    setTimeout(() => {
                        copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
                    }, 2000);
                }
            });
            
            // 将代码块包装在容器中
            const preElement = block.parentElement;
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            preElement.parentNode.insertBefore(wrapper, preElement);
            wrapper.appendChild(preElement);
            wrapper.appendChild(buttonContainer);
            buttonContainer.appendChild(copyButton);
        });
    } else {
        contentDiv.textContent = text;
    }

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = `今天 ${timeString}`;

    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeSpan);

    return messageDiv;
}

// 添加消息到聊天区域
function addMessage(text, sender, isMarkdown = false, saveToStorage = true) {
    const messageElement = createMessageElement(text, sender, isMarkdown);
    chatMessages.appendChild(messageElement);
    scrollToBottom();

    // 只有当saveToStorage为true时才保存到本地存储
    if (saveToStorage) {
        chatStorage.saveMessage({
            text,
            sender,
            timestamp: new Date().toISOString()
        });
    }
}

// 加载历史消息
function loadChatHistory() {
    const history = chatStorage.getHistory();
    history.forEach(msg => {
        // 加载历史消息时不需要再次保存到存储
        addMessage(msg.text, msg.sender, msg.sender === 'ai', false);
    });
}

// 清除聊天记录
function clearChat() {
    if (confirm('确定要清除所有聊天记录吗？')) {
        chatStorage.clearHistory();
        chatMessages.innerHTML = '';
        initWelcomeMessage();
    }
}

// 设置发送按钮状态
function setSendButtonState(isLoading) {
    messageInput.disabled = isLoading;
    sendButton.disabled = isLoading;
    
    if (isLoading) {
        sendIcon.classList.add('d-none');
        loadingIcon.classList.remove('d-none');
    } else {
        sendIcon.classList.remove('d-none');
        loadingIcon.classList.add('d-none');
    }
}

/**
 * 发送消息并处理 AI 响应的核心函数
 * 
 * 功能流程：
 * 1. 验证消息内容
 * 2. 发送用户消息到界面
 * 3. 调用后端 API
 * 4. 流式处理 AI 响应
 * 5. 保存对话历史
 * 
 * @async
 * @function sendMessage
 * @returns {Promise<void>}
 */
async function sendMessage() {
    // 获取并验证消息内容
    const messageText = messageInput.value.trim();
    if (messageText === '') {
        emptyInputToast.show();
        return;
    }

    try {
        // 设置界面为加载状态
        setSendButtonState(true);

        // 显示用户消息并清空输入框
        addMessage(messageText, 'user');
        messageInput.value = '';

        // 创建 AI 响应的消息容器
        const messageElement = createMessageElement('', 'ai', true);
        const contentDiv = messageElement.querySelector('.message-content');
        chatMessages.appendChild(messageElement);

        // 获取最近的对话上下文
        const recentMessages = chatStorage.getRecentMessages();

        // 发送请求到后端 API
        const response = await fetch('/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: messageText,
                history: recentMessages,
                model: chatStorage.getSelectedModel()
            })
        });

        // 初始化流式响应处理
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        // 流式处理 AI 响应
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n');

            // 处理每一行响应数据
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(5));
                        if (data.error) {
                            // 显示错误信息
                            contentDiv.textContent = data.message || data.error;
                        } else if (data.content) {
                            // 累加响应内容并实时更新显示
                            fullText += data.content;
                            contentDiv.innerHTML = marked.parse(fullText);
                            
                            // 对新增内容应用代码高亮和添加复制按钮
                            contentDiv.querySelectorAll('pre code').forEach((block) => {
                                hljs.highlightElement(block);
                                
                                // 检查是否已经添加了包装器
                                const preElement = block.parentElement;
                                if (!preElement.parentElement.classList.contains('code-block-wrapper')) {
                                    // 创建包装器
                                    const wrapper = document.createElement('div');
                                    wrapper.className = 'code-block-wrapper';
                                    
                                    // 创建复制按钮容器
                                    const buttonContainer = document.createElement('div');
                                    buttonContainer.className = 'code-copy-container';
                                    
                                    // 创建复制按钮
                                    const copyButton = document.createElement('button');
                                    copyButton.className = 'code-copy-btn';
                                    copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
                                    copyButton.title = '复制代码';
                                    
                                    // 添加复制功能
                                    copyButton.addEventListener('click', async () => {
                                        try {
                                            await navigator.clipboard.writeText(block.textContent);
                                            copyButton.innerHTML = '<i class="bi bi-clipboard-check"></i>';
                                            copyButton.classList.add('copied');
                                            
                                            setTimeout(() => {
                                                copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
                                                copyButton.classList.remove('copied');
                                            }, 2000);
                                        } catch (err) {
                                            console.error('复制失败:', err);
                                            copyButton.innerHTML = '<i class="bi bi-clipboard-x"></i>';
                                            setTimeout(() => {
                                                copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';
                                            }, 2000);
                                        }
                                    });
                                    
                                    // 将代码块包装在容器中
                                    preElement.parentNode.insertBefore(wrapper, preElement);
                                    wrapper.appendChild(preElement);
                                    wrapper.appendChild(buttonContainer);
                                    buttonContainer.appendChild(copyButton);
                                }
                            });
                            scrollToBottom();
                        }
                    } catch (e) {
                        console.error('解析响应数据失败:', e);
                    }
                }
            }
        }

        // 保存完整的 AI 响应到本地存储
        if (fullText) {
            chatStorage.saveMessage({
                text: fullText,
                sender: 'ai',
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        // 错误处理
        console.error('发送消息失败:', error);
        addMessage('发送消息失败，请重试', 'ai', false);
    } finally {
        // 恢复界面状态
        setSendButtonState(false);
        messageInput.focus();
        scrollToBottom();
    }
}

// 初始化欢迎消息
function initWelcomeMessage() {
    const welcomeText = '您好！我是 SpaceAgent 小助手，请问有什么可以帮您的吗？';
    // 欢迎消息不保存到本地存储
    addMessage(welcomeText, 'ai', false, false);
}

// 初始化模型选择下拉框
async function initModelSelect() {
    try {
        const response = await fetch('/ask');
        if (!response.ok) {
            throw new Error('获取模型列表失败');
        }
        
        const models = await response.json();
        const modelSelect = document.getElementById('modelSelect');
        
        // 清空现有选项
        modelSelect.innerHTML = '';
        
        // 添加新选项
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });
        
        // 设置默认选中的模型
        const savedModel = chatStorage.getSelectedModel();
        if (models.some(model => model.id === savedModel)) {
            modelSelect.value = savedModel;
        } else {
            // 如果保存的模型不在可用列表中，使用第一个模型
            modelSelect.value = models[0].id;
            chatStorage.saveSelectedModel(models[0].id);
        }
    } catch (error) {
        console.error('初始化模型选择失败:', error);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', async function () {
    // 初始化DOM元素
    if (!initDOMElements()) {
        console.error('初始化DOM元素失败');
        return;
    }

    try {
        // 初始化模型选择
        await initModelSelect();
        
        // 初始化事件监听
        initEventListeners();

        // 加载聊天历史或显示欢迎消息
        const history = chatStorage.getHistory();
        if (history.length === 0) {
            initWelcomeMessage();
        } else {
            loadChatHistory();
        }
    } catch (error) {
        console.error('初始化失败:', error);
    }
});