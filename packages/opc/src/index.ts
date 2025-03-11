/**
 * 取消回调
 */
export type CancelFn = () => void

interface IDestroy {
  /**
   * 销毁资源
   */
  destroy(): void
}

/**
 * 消息通道（对等通道）
 */
interface IChannel extends IDestroy {
  /**
   * 连接 MessageEventSource
   */
  connect(source: MessageEventSource): Promise<boolean>
  /**
   * 注册应用域
   * @param cls 应用对象
   */
  register(cls: any): IChannel
  /**
   * 推送message
   * @param data 支持【结构化克隆算法】克隆的数据
   * @param [type="*"]  事件类型
   */
  push(data: any, type?: string): Promise<void>
  /**
   * 执行远程方法调用的方式，并返回结果
   * @param fn 执行函数
   * @param args 参数
   */
  call(fn: Function, ...args: any[]): Promise<any>
  /**
   * 绑定消息侦听器
   * @param listener 侦听器
   * @param [type="*"]  事件类型
   * @returns 取消该消息侦听事件
   */
  message(listener: (data: any) => void, type?: string): CancelFn

  /**
   * 取消消息侦听器
   * @param [type]  事件类型，不传值时移除所有侦听器
   * @param listener 侦听器
   */
  off(type?: string, listener?: (data: any) => void): IChannel
}

enum PacketDataTypeEnum {
  /**
   * 公共数据包
   */
  common = 1 << 0,
  /**
   * 内部数据包
   */
  internal = 1 << 1,
  /**
   * 心跳
   */
  heartbeat = 1 << 2,
  /**
   * 回复
   */
  reply = 1 << 3,
  /**
   * 通道连接
   */
  connect = 1 << 4,
  /**
   * 通道端口连接
   */
  disconnect = 1 << 5,
  /**
   * 超时
   */
  timeout = 1 << 6,
  /**
   * 消息
   */
  message = 1 << 7,
  /**
   * 方法远程调用
   */
  call = 1 << 8,
}

type Packet = {
  readonly playload: PacketData
  /**
   * 时间，ISO格式，示例：`2024-02-26T02:33:33.140Z`
   */
  readonly time: string
  /**
   * 版本
   */
  readonly version: string
  /**
   * 签名
   */
  readonly signature: string
}

type PacketData = {
  /**
   * 数据包编号
   */
  readonly no: number
  /**
   * 数据包类型
   */
  readonly type: PacketDataTypeEnum
  /**
   * 数据
   */
  readonly data?: any
  /**
   * 错误消息
   */
  readonly error?: any
}

class ChannelProtocol implements IDestroy {
  /**
   * 消息处理函数
   * @param data 数据
   * @param protocol ChannelProtocol
   * @param packet 原始数据包
   */
  onmessage?: (data: PacketData, protocol: ChannelProtocol, packet: Packet) => void
  source?: MessageEventSource

  private readonly version = 'v1.0'

  private calls = new Map<
    number,
    {
      resolve: (value: any) => void
      reject: (reason?: any) => void
    }
  >()
  private removeListener?: () => void

  constructor(source?: MessageEventSource, createListener = true) {
    this.source = source
    if (createListener) {
      this.removeListener = this._createListener()
    }
  }
  // listen() {
  //   this.removeListener = this._createListener()
  // }
  /**
   *
   * @param data
   * @param timeout 超时时间
   * @returns
   */
  send(data: PacketData, timeout?: number): Promise<any> {
    if (!this.source) return Promise.reject(new Error('source 未初始化'))

    const source = this.source as MessageEventSource
    return new Promise((resolve, reject) => {
      const packet = this._wrap(data)
      source.postMessage(packet, { targetOrigin: '*' })
      // 添加消息处理回调
      this.calls.set(data.no, { resolve, reject })

      if (timeout) {
        setTimeout(() => {
          const { reject } = this.calls.get(data.no) || {}
          if (reject) {
            reject && reject(new Error('send timeout'))
            this.calls.delete(data.no)
          }
        }, timeout)
      }
    })
  }
  destroy(): void {
    this.removeListener?.()
    this.calls.clear()
  }

  private _createListener() {
    const listener = this._message.bind(this)

    addEventListener('message', listener)
    return () => {
      removeEventListener('message', listener)
    }
  }

  private _message(event: MessageEvent) {
    const t = event.data as Packet
    if (!this._assignable(t)) return
    const playload = t.playload
    const reply = !!(playload.type & PacketDataTypeEnum.reply)
    if (reply) {
      // 另一方回复的消息
      this.calls.get(playload.no)

      const { resolve, reject } = this.calls.get(playload.no) || {}
      this.calls.delete(playload.no) // 移除回调
      if (playload.error) {
        // 远程调用抛异常
        reject && reject(playload.error)
      } else {
        // 远程调用成功
        resolve && resolve(playload.data)
      }
    } else {
      // 另一方主动发送的消息
      this.onmessage?.(t.playload, new ChannelProtocol(event.source as any, false), t)
    }
  }

  private _assignable(t: Packet) {
    return typeof t === 'object' && Reflect.has(t, 'playload') && Reflect.has(t, 'time') && Reflect.has(t, 'version') && Reflect.has(t, 'signature') && t.signature === this._sign(t.time, t.version)
  }

  private _wrap(playload: PacketData) {
    const time = new Date().toISOString()
    const version = this.version
    const packet: Packet = {
      time,
      version,
      playload,
      signature: this._sign(time, version),
    }
    return packet
  }

  private _sign(time: string, version: string) {
    return this._hash(`${time}${version}`, 12)
  }
  private _hash(str: string, digit = 6, cipher = 'dHkfcJupR2ygGO0mX5xVBWZ31KvablITMst9D4C8hjEo7iwLqeS6YQUzNrFAPn') {
    const step = Math.floor(str.length / digit) || 1
    const offset = str.length % digit
    const buffer: Array<any> = []
    for (let i = 0; i < digit && i < str.length; i++) {
      buffer.push(cipher[(str.charCodeAt(i * step) + i + offset) % cipher.length])
    }
    return buffer.join('')
  }
}

class OpenPeerChannel implements IChannel {
  private ready?: Promise<ChannelProtocol>
  private no = 1
  private protocol: ChannelProtocol
  private readonly listeners = new Map<string, ((data: any) => void)[]>()
  private readonly hoisting = new Set<string>()
  private readonly context: Record<string, symbol> = {}
  private readonly log: boolean

  constructor(opts?: { log?: boolean }) {
    const { log = false } = opts || {}
    this.log = log
    this.protocol = new ChannelProtocol()
    this.protocol.onmessage = this._onmessage.bind(this)
  }
  destroy(): void {
    this.protocol.destroy()
  }
  async connect(source: MessageEventSource): Promise<boolean> {
    const protocol = this.protocol
    protocol.source = source

    this.ready = new Promise(async (resolve, reject) => {
      const interval = 100
      const step = (30 * 1000) / interval
      for (let i = 0; i < step; i++) {
        try {
          await protocol.send(
            {
              no: this.no++,
              type: PacketDataTypeEnum.internal | PacketDataTypeEnum.connect,
            },
            interval
          )
          resolve(protocol)
          break
        } catch (e: any) {
          // console.log('catch>>>', e)
        }
      }
      reject('连接失败')
    })
    try {
      await this.ready
    } catch {
      this.ready = undefined
      return false
    }
    return true
  }
  register(cls: any): IChannel {
    if (cls instanceof Function) {
      const name = (cls as Function).name
      this.hoisting.add(name)

      this.context[(cls as Function).name] = cls
    } else {
      for (const name in cls) {
        this.hoisting.add(name)
        this.context[name] = cls[name]
      }
    }

    return this
  }
  async push(data: any, type: string = '*'): Promise<void> {
    const protocol = await this._inspect()

    await protocol.send({
      no: this.no++,
      type: PacketDataTypeEnum.common | PacketDataTypeEnum.message,
      data: {
        message: data,
        messagetype: type,
      },
    })
  }
  // async call(fn: Function): Promise<any> {}

  async call(fn: Function, ...args: any[]): Promise<any> {
    const protocol = await this._inspect()

    return await protocol.send({
      no: this.no++,
      type: PacketDataTypeEnum.common | PacketDataTypeEnum.call,
      data: { args, fnStr: fn.toString() },
    })
  }
  message(listener: (data: any) => void, type: string = '*'): CancelFn {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type)?.push(listener)
    return () => {
      this.off(type, listener)
    }
  }
  off(type?: string | undefined, listener?: ((data: any) => void) | undefined): IChannel {
    if (!type) {
      // 移除所有侦听器
      this.listeners.clear()
    } else if (listener) {
      // 移除指定侦听器
      if (this.listeners.has(type)) {
        const listeners: any = this.listeners.get(type)
        const index = listeners.indexOf(listener)
        index > -1 && listeners.splice(index, 1)
      }
    } else {
      this.listeners.set(type, [])
    }
    return this
  }

  /**
   * 执行连接检查
   */
  private async _inspect() {
    if (this.ready === undefined) throw new Error('请先调用connect方法')
    return await this.ready
  }

  private async _onmessage(data: PacketData, protocol: ChannelProtocol) {
    if (this.log) {
      console.log('onmessage>>>', data)
    }

    let result: any
    let error: any
    // 处理消息
    if (data.type & PacketDataTypeEnum.common && data.type & PacketDataTypeEnum.message) {
      const { message, messagetype = '*' } = data.data || {}
      const fns = this.listeners.get(messagetype) || []
      for (const fn of fns) {
        fn && fn(message)
      }
    }

    if (data.type & PacketDataTypeEnum.common && data.type & PacketDataTypeEnum.call) {
      try {
        result = await this._vmExecute(data.data || {})
      } catch (e: any) {
        error = e?.message || '未知错误'
      }
    }

    // 远端连接
    if (data.type & PacketDataTypeEnum.internal && data.type & PacketDataTypeEnum.connect) {
      this.ready = Promise.resolve(protocol) // 绑定远端连接
    }

    // 回复数据包
    protocol.send({
      no: data.no,
      type: PacketDataTypeEnum.internal | PacketDataTypeEnum.reply,
      data: result,
      error,
    })
  }

  /**
   * 通过虚拟机执行远程调用函数
   * @param param0
   */
  private async _vmExecute({ fnStr, args = [] }: { fnStr: string; args: any[] }) {
    // 变量提升
    const hoisting = this.hoisting.size > 0 ? `const {${[...this.hoisting].join(',')}} = this;\n` : ''
    const fn = new Function(`${hoisting} return ${fnStr}`).bind({
      ...this.context,
    })()
    let result
    // 执行函数调用
    let fnResult = fn(...args)
    if (fnResult instanceof Promise) {
      result = await fnResult
    } else {
      result = fnResult
    }

    return result
  }
}

export { OpenPeerChannel }

export default OpenPeerChannel
