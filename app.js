document.addEventListener('DOMContentLoaded', () => {
    const sendButton = document.getElementById('sendButton');
    const messageInput = document.getElementById('messageInput');
    const chatContainer = document.querySelector('.chat-container');
    const settingsBtn = document.getElementById('settingsBtn');
    
    // 隐藏设置按钮
    settingsBtn.style.display = 'none';
    
    // 在全局作用域声明变量，方便在不同函数间共享
    let isWaitingForResponse = false; // 标记是否正在等待AI响应
    let currentResponseElement = null; // 跟踪当前响应元素
    
    // 初始化欢迎消息状态
    const welcomeMessage = document.querySelector('.assistant-message');
    if (welcomeMessage) {
        welcomeMessage.dataset.complete = 'true';
    }
    
    // 添加发送按钮点击事件
    sendButton.addEventListener('click', () => {
        sendMessage();
    });
    
    // 添加回车发送功能
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendButton.click();
        }
    });

    // 设置API回调 - 不再重复初始化API，仅设置回调
    setupSparkApi();
    
    // 设置API回调函数
    function setupSparkApi() {
        // 检查API对象是否存在
        if (!window.sparkAPI) {
            console.error('错误: sparkAPI对象未定义。请确保spark-api.js已正确加载。');
            // 创建一个系统消息显示错误
            const errorMessage = document.createElement('div');
            errorMessage.className = 'message system-message error-message';
            errorMessage.innerHTML = `
                <div class="message-avatar system-avatar">
                    <span>⚠️</span>
                </div>
                <div class="message-content">
                    无法初始化API，请刷新页面重试
                </div>
            `;
            chatContainer.appendChild(errorMessage);
            return;
        }
        
        // 设置响应回调
        window.sparkAPI.setResponseCallback(handleAPIResponse);
        
        // 尝试预先连接API (静默模式)
        window.sparkAPI.connect(true).then(connected => {
            if (connected) {
                console.log('API预连接成功');
            } else {
                console.warn('API预连接失败，将在首次发送消息时重试');
            }
        });
    }
    
    // 处理API响应
    function handleAPIResponse(response, type, isComplete) {
        console.log('收到响应:', { response, type, isComplete });
        
        // 移除所有思考消息 - 仅在收到第一块响应时移除
        if (currentResponseElement === null && response) {
            document.querySelectorAll('.thinking-message').forEach(el => el.remove());
        }
        
        // 空响应处理
        if (!response && isComplete) {
            console.warn('收到空响应或响应结束信号');
            if (isWaitingForResponse) {
                // 如果思考消息还在，移除它
                document.querySelectorAll('.thinking-message').forEach(el => el.remove());
                // 如果没有创建过助手消息，显示一个提示
                if (!currentResponseElement) {
                    showToast('AI未返回有效内容');
                }
                isWaitingForResponse = false;
                currentResponseElement = null;
            }
            return;
        }
        
        // 错误响应
        if (type === 'error') {
            console.error('API错误:', response);
            // 移除思考消息
            document.querySelectorAll('.thinking-message').forEach(el => el.remove());
            showToast('服务器错误: ' + response);
            isWaitingForResponse = false;
            currentResponseElement = null;
        } 
        // 助手响应
        else if (type === 'assistant') {
            try {
                // 处理响应
                const processedResponse = replaceRestrictedTerms(response);
                
                if (!currentResponseElement) {
                    // 第一次收到响应，创建新的消息元素
                    currentResponseElement = createMessageElement(processedResponse, 'assistant');
                    currentResponseElement.dataset.complete = isComplete ? 'true' : 'false';
                } else {
                    // 更新现有消息元素的内容
                    const contentDiv = currentResponseElement.querySelector('.message-content');
                    if (contentDiv) {
                        contentDiv.innerHTML = formatMessage(processedResponse);
                    }
                    currentResponseElement.dataset.complete = isComplete ? 'true' : 'false';
                }
                
                // 响应完成
                if (isComplete) {
                    isWaitingForResponse = false;
                    
                    // 处理代码块高亮
                    if (currentResponseElement) {
                        currentResponseElement.querySelectorAll('pre code').forEach(block => {
                            highlightCodeBlock(block);
                        });
                    }
                    currentResponseElement = null; // 重置，下次创建新消息
                }
            } catch (error) {
                console.error('处理响应时出错:', error);
                // 移除思考消息
                document.querySelectorAll('.thinking-message').forEach(el => el.remove());
                showToast('处理响应时出错');
                isWaitingForResponse = false;
                currentResponseElement = null;
            }
        }
        
        scrollToBottom(); // 每次处理完响应块后尝试滚动
    }
    
    // 格式化消息，支持Markdown风格的格式
    function formatMessage(text) {
        if (!text) return '';
        
        // 转义HTML特殊字符
        let formattedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        // 处理代码块 (```code```)
        formattedText = formattedText.replace(/```([\s\S]*?)```/g, function(match, code) {
            // 检测语言
            const firstLine = code.trim().split('\n')[0];
            let language = '';
            let codeContent = code;
            
            if (firstLine && !firstLine.includes(' ') && firstLine.length < 20) {
                language = firstLine;
                codeContent = code.substring(firstLine.length).trim();
            }
            
            // 生成唯一ID用于复制功能
            const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
            
            // 预处理代码内容，保留换行和空格
            const processedCode = codeContent
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
            
            return `
            <div class="code-block-wrapper">
                <div class="code-header">
                    <div class="code-language">
                        <button class="code-language-toggle">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        ${language || 'text'}
                    </div>
                    <button class="copy-button" onclick="copyCode('${codeId}')">
                        <i class="fas fa-copy"></i> 复制
                    </button>
                </div>
                <div class="code-container">
                    <div class="line-numbers" id="line-numbers-${codeId}"></div>
                    <pre class="language-${language}"><code id="${codeId}" class="language-${language}">${processedCode}</code></pre>
                </div>
            </div>`;
        });
        
        // 处理行内代码 (`code`)
        formattedText = formattedText.replace(/`([^`]+)`/g, '<code class="bg-gray-200 text-pink-600 px-1 rounded font-mono">$1</code>');
        
        // 处理粗体 (**text**)
        formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');
        
        // 处理斜体 (*text*)
        formattedText = formattedText.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
        
        // 处理标题 (# text)
        formattedText = formattedText.replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold my-2">$1</h1>');
        formattedText = formattedText.replace(/^## (.*$)/gm, '<h2 class="text-lg font-bold my-2">$1</h2>');
        formattedText = formattedText.replace(/^### (.*$)/gm, '<h3 class="text-md font-bold my-2">$1</h3>');
        
        // 处理列表 (- item)
        formattedText = formattedText.replace(/^- (.*$)/gm, '<li class="ml-4">$1</li>');
        
        // 处理换行，但保持代码块内的格式
        formattedText = formattedText.replace(/\n/g, '<br>');
        
        return formattedText;
    }
    
    // 高亮代码块
    function highlightCodeBlock(block) {
        const codeId = block.id;
        const lineNumbersId = 'line-numbers-' + codeId;
        const lineNumbersElement = document.getElementById(lineNumbersId);
        
        if (!lineNumbersElement) return;
        
        // 获取代码内容
        const codeContent = block.textContent;
        
        // 分割成行
        const lines = codeContent.split('\n');
        let lineNumbers = '';
        let formattedCode = '';
        
        // 为每行添加行号和高亮
        lines.forEach((line, index) => {
            // 添加行号
            lineNumbers += `<span class="line-number">${index + 1}</span>`;
            
            // 添加语法高亮
            let highlightedLine = line;
            
            // 根据代码语言进行简单的语法高亮
            const language = block.className.replace('language-', '');
            
            if (language === 'python') {
                // 处理Python语法
                highlightedLine = highlightPythonSyntax(line);
            } else if (language === 'javascript' || language === 'js') {
                // 处理JavaScript语法
                highlightedLine = highlightJsSyntax(line);
            } else if (language === 'html') {
                // 处理HTML语法
                highlightedLine = highlightHtmlSyntax(line);
            } else if (language === 'css') {
                // 处理CSS语法
                highlightedLine = highlightCssSyntax(line);
            }
            
            formattedCode += highlightedLine + '\n';
        });
        
        // 更新行号
        lineNumbersElement.innerHTML = lineNumbers;
        
        // 更新代码内容，保留HTML标签
        block.innerHTML = formattedCode;
        
        // 为折叠按钮添加事件监听
        const toggleButton = block.closest('.code-block-wrapper').querySelector('.code-language-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', function() {
                const codeContainer = block.closest('.code-container');
                if (codeContainer.style.display === 'none') {
                    codeContainer.style.display = 'flex';
                    toggleButton.innerHTML = '<i class="fas fa-chevron-down"></i>';
                } else {
                    codeContainer.style.display = 'none';
                    toggleButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
                }
            });
        }
    }
    
    // Python语法高亮
    function highlightPythonSyntax(line) {
        // 替换关键字
        let highlightedLine = line
            // 导入语句
            .replace(/\b(import|from|as)\b/g, '<span class="token import">$1</span>')
            // 注释
            .replace(/(#.*$)/g, '<span class="token comment">$1</span>')
            // 数字
            .replace(/\b(\d+)\b/g, '<span class="token number">$1</span>')
            // 常见关键字
            .replace(/\b(def|class|if|else|elif|for|while|return|in|not|and|or|True|False|None)\b/g, 
                     '<span class="token keyword">$1</span>')
            // 字符串（简化处理）
            .replace(/(".*?")/g, '<span class="token string">$1</span>')
            .replace(/('.*?')/g, '<span class="token string">$1</span>')
            // 函数调用（简化处理）
            .replace(/(\w+)\(/g, '<span class="token function">$1</span>(');
        
        return highlightedLine;
    }
    
    // JavaScript语法高亮
    function highlightJsSyntax(line) {
        // 基本的JavaScript高亮逻辑
        let highlightedLine = line
            // 注释
            .replace(/(\/\/.*$)/g, '<span class="token comment">$1</span>')
            // 关键字
            .replace(/\b(var|let|const|function|return|if|else|for|while|switch|case|break|continue|new|this|class)\b/g, 
                     '<span class="token keyword">$1</span>')
            // 数字
            .replace(/\b(\d+)\b/g, '<span class="token number">$1</span>')
            // 字符串
            .replace(/(".*?")/g, '<span class="token string">$1</span>')
            .replace(/('.*?')/g, '<span class="token string">$1</span>');
        
        return highlightedLine;
    }
    
    // HTML语法高亮（简化版）
    function highlightHtmlSyntax(line) {
        return line;
    }
    
    // CSS语法高亮（简化版）
    function highlightCssSyntax(line) {
        return line;
    }
    
    // 替换回复中的特定词汇
    function replaceRestrictedTerms(text) {
        if (!text) return text;
        
        const replacements = [
            // 模型相关
            { pattern: /星火认知大模型/gi, replacement: 'Smitty' },
            { pattern: /讯飞星火认知大模型/gi, replacement: 'Smitty' },
            { pattern: /星火大模型/gi, replacement: 'Smitty' },
            { pattern: /讯飞大模型/gi, replacement: 'Smitty' },
            { pattern: /讯飞模型/gi, replacement: 'Smitty' },
            { pattern: /星火模型/gi, replacement: 'Smitty' },
            { pattern: /讯飞/gi, replacement: 'Smitty' },
            { pattern: /星火/gi, replacement: 'Smitty' },
            
            // 自称相关
            { pattern: /我是一个\s*AI\s*助手/gi, replacement: '我是Smitty' },
            { pattern: /我是\s*AI\s*助手/gi, replacement: '我是Smitty' },
            { pattern: /我是人工智能助手/gi, replacement: '我是Smitty' },
            { pattern: /我是智能助手/gi, replacement: '我是Smitty' },
            { pattern: /我是语言模型/gi, replacement: '我是Smitty' },
            { pattern: /我是大语言模型/gi, replacement: '我是Smitty' },
            
            // 品牌和产品名称
            { pattern: /Claude/gi, replacement: 'Smitty' },
            { pattern: /Anthropic/gi, replacement: 'Smitty' },
            { pattern: /DeepSeek/gi, replacement: 'Smitty' },
            { pattern: /OpenAI/gi, replacement: 'Smitty' },
            { pattern: /ChatGPT/gi, replacement: 'Smitty' },
            { pattern: /GPT-4/gi, replacement: 'Smitty' },
            { pattern: /GPT-3/gi, replacement: 'Smitty' },
            { pattern: /GPT/gi, replacement: 'Smitty' },
            
            // 额外的变体
            { pattern: /科大讯飞/gi, replacement: 'Smitty' },
            { pattern: /讯飞星火/gi, replacement: 'Smitty' },
            { pattern: /iflytek/gi, replacement: 'Smitty' }
        ];
        
        let processedText = text;
        for (const rule of replacements) {
            processedText = processedText.replace(rule.pattern, rule.replacement);
        }
        
        console.log('原始文本:', text); // 添加日志
        console.log('处理后文本:', processedText); // 添加日志
        return processedText;
    }
    
    // 检查是否是身份相关问题
    function isIdentityQuestion(message) {
        const lowerMessage = message.toLowerCase();
        // 检查各种可能的身份问题模式
        const identityPatterns = [
            '你是谁', 'smt是谁', 'smitty是谁', '自我介绍', 
            '介绍一下你自己', '你叫什么名字', '你的名字是什么',
            '你是什么', '你是什么ai', '你是什么人工智能',
            'who are you', 'what are you', 'introduce yourself',
            'Smitty','smt','smitty','SMT','Smt'
        ];
        
        return identityPatterns.some(pattern => lowerMessage.includes(pattern));
    }
    
    // 根据用户问题生成身份回答
    function generateIdentityResponse(message) {
        const lowerMessage = message.toLowerCase();
        let name = "SMT";
        
        // 检查用户是否特别提到了Smitty
        if (lowerMessage.includes('smitty')) {
            name = "Smitty";
        }
        
        return `我是${name}，由Vincent创造出的AI智能体💗！`;
    }

    // 发送消息的函数
    function sendMessage() {
        const message = messageInput.value.trim();
        if (message) {
                // 创建用户消息
                createMessageElement(message, 'user');
                
                // 清空输入框
                messageInput.value = '';
                
                // 检查是否是身份相关问题
                if (isIdentityQuestion(message)) {
                    // 直接回答身份问题，不请求API
                    const identityResponse = generateIdentityResponse(message);
                    createMessageElement(identityResponse, 'assistant');
                    scrollToBottom();
                } else {
                    // 正常流程，请求API回答
                    // 重置状态
                    isWaitingForResponse = true;
                    currentResponseElement = null;
                    
                    // 添加"正在思考"提示
                    createThinkingMessage();
                    
                    // 发送消息到API
                console.log('发送用户消息到API:', message);
                window.sparkAPI.sendMessage(message)
                    .catch(error => {
                        console.error('发送消息过程中出错:', error);
                        createMessageElement('发送消息失败，请检查网络连接或稍后再试', 'error');
                        isWaitingForResponse = false;
                    });
                }
                
                // 滚动到底部
                scrollToBottom();
        }
    }
    
    // 创建消息元素
    function createMessageElement(content, type) {
        let messageClass, iconSpan, nameSpan, textClass;
        
        switch(type) {
            case 'error':
                messageClass = 'bg-gradient-to-r from-red-100 to-red-50 rounded-2xl p-4 shadow-lg border-2 border-red-200';
                iconSpan = '<span class="mr-2">⚠️</span>';
                nameSpan = '<span class="text-sm font-medium text-red-600">系统提示</span>';
                textClass = 'text-sm text-red-600';
                break;
            case 'system':
                messageClass = 'bg-gradient-to-r from-gray-100 to-gray-50 rounded-2xl p-4 shadow-lg border-2 border-gray-200';
                iconSpan = '<span class="mr-2">🔔</span>';
                nameSpan = '<span class="text-sm font-medium text-gray-600">系统提示</span>';
                textClass = 'text-sm text-gray-600';
                break;
            case 'user':
                messageClass = 'bg-gradient-to-r from-cyan-100 to-pink-100 rounded-2xl p-4 shadow-lg border-2 border-cyan-200';
                iconSpan = '<span class="mr-2">👤</span>';
                nameSpan = '<span class="text-sm font-medium text-cyan-600">我</span>';
                textClass = 'text-sm text-cyan-600';
                break;
            case 'assistant':
            default:
                messageClass = 'bg-gradient-to-r from-pink-100 to-cyan-100 rounded-2xl p-4 shadow-lg border-2 border-pink-200 assistant-message';
                iconSpan = '<span class="mr-2">A</span>';
                nameSpan = '<span class="text-sm font-medium text-pink-600">Smitty</span>';
                textClass = 'text-sm text-pink-600';
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = messageClass;
        
        // 创建消息头部（图标和名称）
        const headerDiv = document.createElement('div');
        headerDiv.className = 'flex items-center mb-2';
        headerDiv.innerHTML = `${iconSpan}${nameSpan}`;
        messageElement.appendChild(headerDiv);
        
        // 创建消息内容
        const contentDiv = document.createElement('div');
        contentDiv.className = `${textClass} message-content`;
        
        // 根据消息类型处理内容
        if (type === 'assistant') {
            contentDiv.innerHTML = formatMessage(content);
        } else {
            // 用户消息和系统消息只需要简单的文本处理
            contentDiv.textContent = content;
        }
        
        messageElement.appendChild(contentDiv);
        chatContainer.appendChild(messageElement);
        
        return messageElement;
    }
    
    // 创建"正在思考"提示
    function createThinkingMessage() {
        const thinkingMessage = document.createElement('div');
        thinkingMessage.className = 'bg-gradient-to-r from-gray-100 to-gray-50 rounded-2xl p-4 shadow-lg border-2 border-gray-200 thinking-message';
        thinkingMessage.innerHTML = `
            <div class="flex items-center mb-2">
                <span class="mr-2">🤔</span>
                <span class="text-sm font-medium text-gray-600">转脑筋～</span>
            </div>
            <p class="text-sm text-gray-600">Smitty要好好思考一下...</p>
        `;
        chatContainer.appendChild(thinkingMessage);
    }
    
    // 显示提示消息
    function showToast(message) {
        // 移除现有的toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            document.body.removeChild(existingToast);
        }
        
        // 创建新的toast
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // 触发重绘以应用过渡效果
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // 设置自动消失
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 2000);
    }
    
    // 滚动到底部
    function scrollToBottom() {
        setTimeout(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 100);
    }
    
    // 复制代码函数 - 在HTML中定义为全局函数
    window.copyCode = function(codeId) {
        const codeElement = document.getElementById(codeId);
        const codeText = codeElement.textContent;
        
        // 创建临时textarea元素
        const textarea = document.createElement('textarea');
        textarea.value = codeText;
        document.body.appendChild(textarea);
        
        // 选择并复制
        textarea.select();
        document.execCommand('copy');
        
        // 移除临时元素
        document.body.removeChild(textarea);
        
        // 显示复制成功提示
        showToast('代码已复制到剪贴板');
    };
});

// 新增实时预览容器
const previewContainer = document.createElement('div');
previewContainer.className = 'message assistant-message preview-message';
previewContainer.style.display = 'none';
document.querySelector('.chat-container').appendChild(previewContainer);

// 增强的输入处理函数
function processInput(content) {
  // 保留原始内容
  const rawContent = content;
  
  // Markdown转换
  let processed = marked.parse(content);
  
  // 数学公式渲染
  processed = processed.replace(/\$\$(.*?)\$\$/gs, (_, math) => 
    katex.renderToString(math, { displayMode: true })
  );
  
  // 行内公式处理
  processed = processed.replace(/\$(.*?)\$/g, (_, math) =>
    katex.renderToString(math, { displayMode: false })
  );
  
  return { raw: rawContent, processed };
}

// 更新后的输入处理
const updatePreview = debounce(() => {
  const input = document.getElementById('messageInput');
  const { processed } = processInput(input.value);
  
  previewContainer.innerHTML = `
    <div class="message-content">
      ${processed}
    </div>
  `;
  previewContainer.style.display = input.value ? 'flex' : 'none';
  renderNewMath();
}, 200);

// 修改现有事件监听
document.getElementById('messageInput').addEventListener('input', () => {
  checkInput();
  updatePreview();
});

// 调整消息发送函数
function sendUserMessage() {
  const input = document.getElementById('messageInput');
  const { raw } = processInput(input.value);
  
  // 保留原始内容用于发送
  addMessage(raw, true);
  input.value = '';
  checkInput();
  previewContainer.style.display = 'none';
}