import { CancelFn, IChannel, Packet, PacketData, PacketDataTypeEnum } from './define'

const version = 'v1.0'

function _hash(str: string, digit = 6, cipher = 'dHkfcJupR2ygGO0mX5xVBWZ31KvablITMst9D4C8hjEo7iwLqeS6YQUzNrFAPn') {
  const step = Math.floor(str.length / digit) || 1
  const offset = str.length % digit
  const buffer: Array<any> = []
  for (let i = 0; i < digit && i < str.length; i++) {
    buffer.push(cipher[(str.charCodeAt(i * step) + i + offset) % cipher.length])
  }
  return buffer.join('')
}

function _sign(time: string, version: string) {
  return _hash(`${time}${version}`, 12)
}

function _wrap(playload: PacketData) {
  const time = new Date().toISOString()
  const packet: Packet = {
    time,
    version,
    playload,
    signature: _sign(time, version),
  }
  return packet
}

/**
 * 检查是否符合数据包是否为符合通信请求协议
 * @param t
 * @returns
 */
function _assignable(t: Packet) {
  return typeof t === 'object' && Reflect.has(t, 'playload') && Reflect.has(t, 'time') && Reflect.has(t, 'version') && Reflect.has(t, 'signature') && t.signature === _sign(t.time, t.version)
}
type OpenPeerChannelOptions = {
  /**
   * 显示日志
   */
  log?: boolean
}
class OpenPeerChannel implements IChannel {
  private no = 1
  private calls = new Map<
    number,
    {
      resolve: (value: any) => void
      reject: (reason?: any) => void
    }
  >()
  private readonly listeners = new Map<string, Set<(data: any) => void>>()
  private readonly hoisting = new Set<string>()
  private readonly context: Record<string, symbol> = {}
  private readonly channel: BroadcastChannel
  private readonly state: Required<OpenPeerChannelOptions> = {
    log: false,
  }

  constructor(name: string = 'open-peer-channel', options?: OpenPeerChannelOptions) {
    Object.assign(this.state, options)

    const channel = new BroadcastChannel(name)

    channel.addEventListener(
      'message',
      (e: MessageEvent) => {
        const t = e.data as Packet
        if (!_assignable(t)) return

        const playload = t.playload
        const reply = !!(playload.type & PacketDataTypeEnum.reply)
        if (reply) {
          // 另一方回复的消息
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
          this._onmessage(t.playload, e.source as any, t)
        }
      },
      {
        passive: true,
      }
    )

    this.channel = channel
  }

  count(): number {
    throw new Error('Method not implemented.')
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
  push(data: any, type?: string): void {
    this._send(
      {
        no: this.no++,
        type: PacketDataTypeEnum.common & PacketDataTypeEnum.message,
        data: {
          message: data,
          messagetype: type,
        },
      },
      false
    )
  }
  async call(fn: Function, ...args: any[]): Promise<any> {
    const result = await this._send(
      {
        no: this.no++,
        type: PacketDataTypeEnum.common | PacketDataTypeEnum.call,
        data: { fnStr: fn.toString(), args: args },
      },
      true
    )
    return result
  }
  message(listener: (data: any) => void, type: string = '*'): CancelFn {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())

    const listeners = this.listeners.get(type) as Set<(data: any) => void>
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  off(type?: string, listener?: (data: any) => void): IChannel {
    if (!type) {
      // 移除所有侦听器
      this.listeners.clear()
    } else if (listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set())

      // 移除指定侦听器
      const listeners = this.listeners.get(type) as Set<(data: any) => void>
      listeners.delete(listener)
    } else {
      this.listeners.set(type, new Set<(data: any) => void>())
    }
    return this
  }

  /**
   * 发送数据包
   * @param data 数据包数据
   */
  private _send(data: PacketData, reply: false, source?: MessageEventSource): void
  /**
   * 发送数据包
   * @param data 数据包数据
   * @param reply 需要回复
   */
  private _send(data: PacketData, reply: true, source?: MessageEventSource): Promise<any>
  private _send(data: PacketData, reply: boolean, source?: MessageEventSource): void | Promise<any> {
    const channel = source || this.channel
    const packet = _wrap(data)
    // 不需要回复的数据包，直接发送即可
    if (!reply) {
      channel.postMessage(packet)
    } else {
      // 需要回复的数据包
      return new Promise((resolve, reject) => {
        // 添加消息处理回调
        this.calls.set(data.no, { resolve, reject })
        channel.postMessage(packet)
      })
    }
  }

  private async _onmessage(data: PacketData, source: MessageEventSource, rawPacket: Packet) {
    if (this.state.log) {
      console.log('onmessage>>>', data)
    }

    let result: any
    let error: any
    // 处理消息
    if (data.type & PacketDataTypeEnum.common && data.type & PacketDataTypeEnum.message) {
      const { message, messagetype = '*' } = data.data || {}

      if (!this.listeners.has(messagetype)) this.listeners.set(messagetype, new Set())

      const fns = this.listeners.get(messagetype) as Set<(data: any) => void>
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
    // 回复数据包
    this._send(
      {
        no: data.no,
        type: PacketDataTypeEnum.internal | PacketDataTypeEnum.reply,
        data: result,
        error,
      },
      false,
      source
    )
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
