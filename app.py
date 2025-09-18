from flask import Flask, render_template, request, redirect, url_for, jsonify, Response, session
import requests as directReq
import json
import sqlite3
from functools import wraps
import hashlib


'''
TODO: 实现一个Agent基座服务
TIME: 2025/04/13 16:50
API : 调用OpenAI免费开放的API服务
DESC: 为了更好的编写这里的代码，因此，这里将会自行研究代码，实现一个人工智能问答的基座程序
'''


def init_db():
    """初始化数据库"""
    try:
        conn = sqlite3.connect('users.db')
        c = conn.cursor()

        # 创建用户表
        c.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        conn.commit()
    except Exception as e:
        print(f"数据库初始化失败：{str(e)}")
    finally:
        conn.close()


# 确保在应用启动时初始化数据库
init_db()

# 初始化 Flask 应用
app = Flask(__name__)
app.secret_key = 'random1234567890'  # 用于session加密，请修改为随机字符串

# 模型配置字典
MODEL_CONFIGS = {
    'qwen-coder': {
        'url': 'https://api-inference.modelscope.cn/v1/chat/completions',
        'api_key': '<your_key>',
        'model': 'Qwen/Qwen2.5-Coder-32B-Instruct',
        'name': 'qwen-coder'
    },
    'openai': {
        'url': 'https://api.chatanywhere.tech/v1/chat/completions',
        'api_key': '<your_key>',
        'model': 'gpt-3.5-turbo',
        'temperature': 0.7,
        'name': 'openai'
    },
    'deepseek': {
        'url': 'https://api.deepseek.com/chat/completions',
        'api_key': '<your_key>',
        'model': 'deepseek-chat',
        'name': 'Deepseek-v3'
    },
    'hunyuan': {
        'url': 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions',
        'api_key': '<your_key>',
        'model': 'hunyuan-lite',
        'name': 'hunyuan'
    }
}


def create_error_response(error_type, message, status_code=400):
    return jsonify({
        'error': error_type,
        'message': message
    }), status_code


def hash_password(password):
    """对密码进行哈希处理"""
    return hashlib.sha256(password.encode()).hexdigest()


def login_required(f):
    """登录验证装饰器"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        print(session)  # 检查session中是否有user_id
        return f(*args, **kwargs)

    return decorated_function


# 访问根目录，返回主页的页面
@app.route('/')
def hello_world():
    """首页路由"""
    return render_template('index.html')


# 实现用户登录的接口 分为 Post 和 Get 两种请求
@app.route('/login', methods=['GET', 'POST'])
def login():
    """登录功能"""
    if request.method == 'GET':
        info = request.args.get('info')
        data = {
            'title': '登录',
            'entry_button': '登录',
            'action_url': '/login',
            'is_login': True,
            'is_fail': info == 'login_fail'
        }
        return render_template('login.html', data=data)

    # POST请求处理
    username = request.form.get('username')
    password = request.form.get('password')

    if not username or not password:
        return redirect(url_for('login', info='login_fail'))

    try:
        conn = sqlite3.connect('users.db')
        c = conn.cursor()
        c.execute('SELECT id, password FROM users WHERE username = ?', (username,))
        user = c.fetchone()
        conn.close()

        if user and user[1] == hash_password(password):
            session['user_id'] = user[0]
            session['username'] = username
            return redirect(url_for('chat'))

        return redirect(url_for('login', info='login_fail'))
    except Exception as e:
        return redirect(url_for('login', info='login_fail'))


# 实现注册的接口，分为 Post 和 Get 两种请求
@app.route('/register', methods=['GET', 'POST'])
def register():
    """注册功能"""
    if request.method == 'GET':
        data = {
            'title': '注册',
            'entry_button': '注册',
            'action_url': '/register',
            'is_login': False,
            'is_fail': request.args.get('info') == 'register_fail'
        }
        return render_template('login.html', data=data)

    # POST请求处理
    username = request.form.get('username')
    password = request.form.get('password')

    if not username or not password:
        print(
            f"注册失败：用户名或密码为空 - username: {username}, password: {'*' * len(password) if password else None}")
        return redirect(url_for('register', info='register_fail'))

    try:
        # 验证用户名和密码长度
        if len(username) < 3 or len(username) > 20 or len(password) < 6:
            print(
                f"注册失败：用户名或密码长度不符合要求 - username length: {len(username)}, password length: {len(password)}")
            return redirect(url_for('register', info='register_fail'))

        conn = sqlite3.connect('users.db')
        c = conn.cursor()

        # 检查用户名是否已存在
        c.execute('SELECT id FROM users WHERE username = ?', (username,))
        if c.fetchone() is not None:
            conn.close()
            print(f"注册失败：用户名已存在 - username: {username}")
            return redirect(url_for('register', info='register_fail'))

        try:
            # 插入新用户
            hashed_password = hash_password(password)
            c.execute('INSERT INTO users (username, password) VALUES (?, ?)',
                      (username, hashed_password))
            conn.commit()
            print(f"注册成功 - username: {username}")
            conn.close()
            return redirect(url_for('login'))
        except sqlite3.Error as e:
            print(f"数据库插入错误：{str(e)}")
            conn.close()
            return redirect(url_for('register', info='register_fail'))

    except Exception as e:
        print(f"注册过程发生错误：{str(e)}")
        return redirect(url_for('register', info='register_fail'))


# 开始进行对话，返回对话的页面
@app.route('/chat')
@login_required
def chat():
    """聊天页面路由"""
    return render_template('chat.html')


# 对对话的请求进行处理，使用流式响应
@app.route('/ask', methods=['POST'])
@login_required
def ask_page():
    """
    处理聊天请求

    Returns:
        流式响应，包含AI的回复内容
    """
    try:
        # 验证请求数据
        text = request.get_json()
        if not text or 'message' not in text:
            return create_error_response('请求错误', '缺少必要的message字段')

        # 获取并验证模型配置
        model_type = text.get('model', 'openai')
        if model_type not in MODEL_CONFIGS:
            return create_error_response('请求错误', '不支持的模型类型')

        # 准备请求数据
        model_config = MODEL_CONFIGS[model_type]
        message = text['message']
        history = text.get('history', [])

        # 构建消息历史
        messages = [{"role": "assistant" if msg['sender'] == 'ai' else "user",
                     "content": msg['text']} for msg in history]
        messages.append({"role": "user", "content": message})

        # 准备API请求参数
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {model_config["api_key"]}'
        }

        data = {
            "model": model_config["model"],
            "messages": messages,
            "stream": True
        }

        # 如果是OpenAI模型，添加temperature参数
        if model_type == 'openai':
            data["temperature"] = model_config["temperature"]

        def generate():
            """生成器函数，用于流式传输响应"""
            try:
                response = directReq.post(
                    model_config['url'], headers=headers, json=data, stream=True)

                if response.status_code != 200:
                    error_msg = json.dumps({
                        'error': '调用AI服务失败',
                        'message': f'调用AI服务失败, 状态码: {response.status_code} {response.text}'
                    })
                    yield f"data: {error_msg}\n\n"
                    return

                for line in response.iter_lines():
                    if line:
                        try:
                            # 处理SSE格式的响应
                            line = line.decode('utf-8')
                            if line.startswith('data: '):
                                line = line[6:]
                            if line == '[DONE]':
                                break

                            json_data = json.loads(line)
                            if 'choices' in json_data and json_data['choices']:
                                delta = json_data['choices'][0].get(
                                    'delta', {})
                                if 'content' in delta:
                                    content = delta['content']
                                    yield f"data: {json.dumps({'content': content})}\n\n"
                        except Exception as e:
                            continue

            except Exception as e:
                error_msg = json.dumps({
                    'error': '生成响应失败',
                    'message': str(e)
                })
                yield f"data: {error_msg}\n\n"

        return Response(generate(), mimetype='text/event-stream')

    except Exception as e:
        error_msg = json.dumps({
            'error': '服务器内部错误',
            'message': str(e)
        })
        return f"data: {error_msg}\n\n", 500, {'Content-Type': 'text/event-stream'}


# 获取可用的模型列表
@app.route('/ask', methods=['GET'])
@login_required
def get_models():
    """
    获取可用的模型列表

    Returns:
        JSON格式的模型列表，包含每个模型的id和名称
    """
    try:
        models = [{'id': key, 'name': config['name']} for key, config in MODEL_CONFIGS.items()]
        return jsonify(models)
    except Exception as e:
        return create_error_response('服务器错误', '获取模型列表失败', 500)


@app.route('/logout')
def logout():
    """登出功能"""
    session.clear()
    return redirect(url_for('login'))


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
