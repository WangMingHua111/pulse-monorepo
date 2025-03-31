/**
 * 取消回调
 */
export type CancelFn = () => void
/**
 * 消息通道（对等通道）
 */
export interface IChannel {
  /**
   * 销毁对象
   */
  destroy(): void
  /**
   * 返回客户端记数数量（暂未实现）
   */
  count(): number
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
  push(data: any, type?: string): void
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

  /**
   * 连接到远端，远端配置了allowCors时生效
   * @param win iframe.contentWindow
   */
  connect(win: Window): Promise<boolean>
}

/**
 * 数据包类型
 */
export enum PacketDataTypeEnum {
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
   * 超时
   */
  timeout = 1 << 6,
  /**
   * 发送普通消息
   */
  message = 1 << 7,
  /**
   * 远程方法调用
   */
  call = 1 << 8,
  /**
   * 通道连接
   */
  connect = 1 << 9,
}

/**
 * 数据包
 */
export type Packet = {
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
/**
 * 数据包数据
 */
export type PacketData = {
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
